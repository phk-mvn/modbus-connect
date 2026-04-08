// modbus/utils/framer.ts

import { CRC16_MODBUS_TABLE } from '../constants/constants';

function calculateCrc16(data: Uint8Array): Uint8Array {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const index = (crc ^ data[i]!) & 0xff;
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[index]!;
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
}

// ====================== RTU FRAMER ======================

export class RtuFramer {
  public static buildAdu(slaveId: number, pdu: Uint8Array): Uint8Array {
    const adu = new Uint8Array(1 + pdu.length + 2);
    adu[0] = slaveId;
    adu.set(pdu, 1);
    const crc = calculateCrc16(adu.subarray(0, 1 + pdu.length));
    adu.set(crc, 1 + pdu.length);
    return adu;
  }

  public static parseAdu(packet: Uint8Array): { unitId: number; pdu: Uint8Array } {
    if (packet.length < 4) throw new Error('Invalid RTU packet: too short');
    const dataForCrc = packet.subarray(0, -2);
    const receivedCrc = packet.subarray(-2);
    const calculatedCrc = calculateCrc16(dataForCrc);

    if (receivedCrc[0] !== calculatedCrc[0] || receivedCrc[1] !== calculatedCrc[1]) {
      throw new Error('CRC mismatch');
    }

    return { unitId: packet[0]!, pdu: packet.slice(1, -2) };
  }

  public static getExpectedResponseLength(pdu: Uint8Array): number | null {
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
    return expectedPduLen >= 0 ? expectedPduLen + 3 : null;
  }
}

// ====================== TCP FRAMER ======================

export class TcpFramer {
  private static transactionId = 0;

  private static getNextTid(): number {
    this.transactionId = (this.transactionId + 1) % 65536;
    return this.transactionId;
  }

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

  public static parseAdu(packet: Uint8Array): { unitId: number; pdu: Uint8Array } {
    if (packet.length < 7) throw new Error('short');
    const followingLen = (packet[4]! << 8) | packet[5]!;
    const totalExpectedLen = 6 + followingLen;
    if (packet.length < totalExpectedLen) throw new Error('short');
    if (((packet[2]! << 8) | packet[3]!) !== 0) throw new Error('Invalid Protocol ID');

    return { unitId: packet[6]!, pdu: packet.slice(7, totalExpectedLen) };
  }

  public static getExpectedResponseLength(pdu: Uint8Array): number | null {
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
    return expectedPduLen >= 0 ? expectedPduLen + 7 : null;
  }
}

// Final isomorphic exports
export default {
  RtuFramer,
  TcpFramer,
};
