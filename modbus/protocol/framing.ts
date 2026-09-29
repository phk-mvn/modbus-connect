// modbus/protocol/framing.ts

import { CRC16_MODBUS_TABLE } from '../constants/modbus.js';
import { ModbusCRCError } from '../core/errors.js';
import type { TModbusProtocolType, TRSMode } from '../types/public.js';

/**
 * Calculates the CRC16 checksum for Modbus RTU packets.
 * Uses a precomputed table for performance.
 *
 * @param {Uint8Array} data - The input data buffer to calculate the checksum for.
 * @returns {Uint8Array} A 2-byte Uint8Array containing the CRC (low byte first, then high byte).
 */
function calculateCrc16(data: Uint8Array): Uint8Array {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const index = (crc ^ data[i]!) & 0xff;
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[index]!;
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
}

// ====================== SHARED RESPONSE LENGTH LOGIC ======================

/**
 * The length of the response PDU that the device will return for this request (excluding transport headers:
 * unitId/CRC for RTU and MBAP for TCP).
 *
 * This is the single location where Modbus response length rules are defined. Previously, this switch
 * was duplicated in RtuFramer and TcpFramer, meaning changes (such as handling short exception
 * responses) had to be made in two places—making it easy for them to get out of sync.
 *
 * @param {Uint8Array} pdu - The request PDU.
 * @returns {number | null} The length of the response PDU in bytes, or null if it cannot be predicted.
 */
function expectedResponsePduLength(pdu: Uint8Array): number | null {
  if (pdu.length === 0) return null;
  const fc = pdu[0];
  let expectedPduLen = -1;

  switch (fc) {
    case 0x01:
    case 0x02:
      if (pdu.length >= 5) {
        const bits = (pdu[3]! << 8) | pdu[4]!;
        expectedPduLen = 2 + Math.ceil(bits / 8);
      }
      break;
    case 0x03:
    case 0x04:
      if (pdu.length >= 5) {
        const regs = (pdu[3]! << 8) | pdu[4]!;
        expectedPduLen = 2 + regs * 2;
      }
      break;
    case 0x05:
    case 0x06:
    case 0x0f:
    case 0x10:
      expectedPduLen = 5;
      break;
    default:
      return null;
  }

  return expectedPduLen >= 0 ? expectedPduLen : null;
}

// ====================== RTU FRAMER ======================

/**
 * Utility class for Modbus RTU (Remote Terminal Unit) framing.
 * Provides methods to wrap PDUs into RTU ADUs and validate incoming RTU packets.
 */
export class RtuFramer {
  /**
   * Builds a Modbus RTU ADU (Application Data Unit).
   * Structure: [Slave ID (1b)] [PDU (nb)] [CRC (2b)]
   *
   * @param {number} slaveId - The target slave unit identifier (typically 1-247).
   * @param {Uint8Array} pdu - The Modbus Protocol Data Unit (Function Code + Data).
   * @returns {Uint8Array} The complete RTU packet ready for transmission.
   */
  public static buildAdu(slaveId: number, pdu: Uint8Array): Uint8Array {
    const adu = new Uint8Array(1 + pdu.length + 2);
    adu[0] = slaveId;
    adu.set(pdu, 1);
    const crc = calculateCrc16(adu.subarray(0, 1 + pdu.length));
    adu.set(crc, 1 + pdu.length);
    return adu;
  }

  /**
   * Parses and validates a raw Modbus RTU packet.
   * Performs CRC verification and extracts the Unit ID and PDU.
   *
   * @param {Uint8Array} packet - The raw byte buffer received from the serial port.
   * @returns {{ unitId: number; pdu: Uint8Array }} Object containing the extracted unit ID and PDU.
   * @throws {Error} Throws if the packet is too short or if the CRC checksum is invalid.
   */
  public static parseAdu(packet: Uint8Array): { unitId: number; pdu: Uint8Array } {
    if (packet.length < 4) throw new Error('Invalid RTU packet: too short');
    const dataForCrc = packet.subarray(0, -2);
    const receivedCrc = packet.subarray(-2);
    const calculatedCrc = calculateCrc16(dataForCrc);

    if (receivedCrc[0] !== calculatedCrc[0] || receivedCrc[1] !== calculatedCrc[1]) {
      throw new ModbusCRCError('CRC mismatch');
    }

    return { unitId: packet[0]!, pdu: packet.slice(1, -2) };
  }

  /** RTU transport frames in the response: unitId (1) + CRC (2) = 3 bytes.
   * This is the overhead added to the PDU length to get the total ADU length.
   */
  private static readonly RESPONSE_OVERHEAD = 3;

  /**
   * Exception response length: unitId + (FC | 0x80) + error code + CRC = 5 bytes.
   * The device responds this way to an invalid address or function; one must not
   * wait for the full length of a successful response in this case, or a timeout
   * will occur instead of an error.
   */
  public static readonly exceptionResponseLength = 5;

  /**
   * Predicts the total expected length of an RTU response based on the request PDU.
   * Useful for knowing how many bytes to read from a serial stream.
   *
   * @param {Uint8Array} pdu - The request PDU (the PDU sent to the device).
   * @returns {number | null} The expected length of the full ADU in bytes, or null if unknown.
   */
  public static getExpectedResponseLength(pdu: Uint8Array): number | null {
    const pduLen = expectedResponsePduLength(pdu);
    return pduLen === null ? null : pduLen + RtuFramer.RESPONSE_OVERHEAD;
  }
}

// ====================== TCP FRAMER ======================

/**
 * Utility class for Modbus TCP framing.
 * Handles the MBAP (Modbus Application Protocol) header used over Ethernet.
 */
export class TcpFramer {
  /**
   * Internal transaction counter.
   * @private
   */
  private static transactionId = 0;

  /**
   * Increments and returns the next Transaction Identifier (TID).
   * Rolls over at 65535.
   *
   * @private
   * @returns {number} The next 16-bit transaction ID.
   */
  private static getNextTid(): number {
    this.transactionId = (this.transactionId + 1) % 65536;
    return this.transactionId;
  }

  /**
   * Builds a Modbus TCP ADU (Application Data Unit).
   * Structure: [TID (2b)] [PID (2b)] [Length (2b)] [Unit ID (1b)] [PDU (nb)]
   *
   * @param {number} unitId - The unit identifier (typically 0xFF or 1 for TCP).
   * @param {Uint8Array} pdu - The Modbus Protocol Data Unit.
   * @returns {Uint8Array} The complete TCP packet with MBAP header.
   */
  public static buildAdu(unitId: number, pdu: Uint8Array): Uint8Array {
    const adu = new Uint8Array(7 + pdu.length);
    const tid = this.getNextTid();
    adu[0] = (tid >> 8) & 0xff;
    adu[1] = tid & 0xff;
    adu[2] = 0x00;
    adu[3] = 0x00;
    const length = pdu.length + 1;
    adu[4] = (length >> 8) & 0xff;
    adu[5] = length & 0xff;
    adu[6] = unitId;
    adu.set(pdu, 7);
    return adu;
  }

  /**
   * Parses and validates a Modbus TCP packet.
   * Validates the MBAP header and extracts the Unit ID and PDU.
   *
   * @param {Uint8Array} packet - The raw byte buffer received from the socket.
   * @returns {{ unitId: number; pdu: Uint8Array }} Object containing the extracted unit ID and PDU.
   * @throws {Error} Throws if the packet is too short or if the Protocol ID is not 0.
   */
  public static parseAdu(packet: Uint8Array): { unitId: number; pdu: Uint8Array } {
    if (packet.length < 7) throw new Error('short');
    const followingLen = (packet[4]! << 8) | packet[5]!;
    const totalExpectedLen = 6 + followingLen;
    if (packet.length < totalExpectedLen) throw new Error('short');
    if (((packet[2]! << 8) | packet[3]!) !== 0) throw new Error('Invalid Protocol ID');

    return { unitId: packet[6]!, pdu: packet.slice(7, totalExpectedLen) };
  }

  /**
   * TCP transport frames in the response: MBAP header (7 bytes).
   * This includes Transaction ID (2), Protocol ID (2), Length (2), and Unit ID (1).
   */
  private static readonly RESPONSE_OVERHEAD = 7;

  /** Exception response length: MBAP header (7) + (FC | 0x80) + error code = 9 bytes.
   * The device responds this way to an invalid address or function; one must not
   * wait for the full length of a successful response in this case, or a timeout
   * will occur instead of an error.
   */
  public static readonly exceptionResponseLength = 9;

  /**
   * Predicts the total expected length of a TCP response based on the request PDU.
   * Includes the 7-byte MBAP header.
   *
   * @param {Uint8Array} pdu - The request PDU.
   * @returns {number | null} The expected length of the full ADU in bytes, or null if unknown.
   */
  public static getExpectedResponseLength(pdu: Uint8Array): number | null {
    const pduLen = expectedResponsePduLength(pdu);
    return pduLen === null ? null : pduLen + TcpFramer.RESPONSE_OVERHEAD;
  }
}

/**
 * Maps a physical port mode to the Modbus framing it implies.
 * RS485/RS232 -> RTU, TCP/IP -> TCP. Single source of truth for client framing.
 *
 * @param rsMode - RS mode reported by the port transport.
 */
export function rsModeToFraming(rsMode: TRSMode): TModbusProtocolType {
  return rsMode === 'TCP/IP' ? 'tcp' : 'rtu';
}

export default {
  RtuFramer,
  TcpFramer,
  rsModeToFraming,
};
