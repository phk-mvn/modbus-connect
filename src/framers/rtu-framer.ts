// src/framers/rtu-framer.ts
import { ModbusFramer } from './modbus-framer.js';
import { crc16Modbus } from '../utils/crc.js';
import { concatUint8Arrays, sliceUint8Array, toHex } from '../utils/utils.js';
import { ModbusCRCError, ModbusResponseError } from '../errors.js';

export class RtuFramer implements ModbusFramer {
  constructor(private crcFn: (data: Uint8Array) => Uint8Array = crc16Modbus) {}

  public buildAdu(slaveId: number, pdu: Uint8Array): Uint8Array {
    const aduWithoutCrc = concatUint8Arrays([new Uint8Array([slaveId]), pdu]);
    const crc = this.crcFn(aduWithoutCrc);
    return concatUint8Arrays([aduWithoutCrc, crc]);
  }

  public parseAdu(packet: Uint8Array) {
    if (packet.length < 4) {
      throw new ModbusResponseError('Invalid RTU packet: too short');
    }

    const receivedCrc = sliceUint8Array(packet, -2);
    const aduWithoutCrc = sliceUint8Array(packet, 0, -2);
    const calculatedCrc = this.crcFn(aduWithoutCrc);

    if (receivedCrc[0] !== calculatedCrc[0] || receivedCrc[1] !== calculatedCrc[1]) {
      throw new ModbusCRCError(
        `CRC mismatch: received ${toHex(receivedCrc)}, calculated ${toHex(calculatedCrc)}`
      );
    }

    return {
      unitId: packet[0]!,
      pdu: sliceUint8Array(packet, 1, -2),
    };
  }

  public getExpectedResponseLength(pdu: Uint8Array): number | null {
    const funcCode = pdu[0];
    let expectedPduLen: number | null = null;

    switch (funcCode) {
      case 0x01:
      case 0x02:
        const bitCount = (pdu[3]! << 8) | pdu[4]!;
        expectedPduLen = 2 + Math.ceil(bitCount / 8);
        break;
      case 0x03:
      case 0x04:
        const regCount = (pdu[3]! << 8) | pdu[4]!;
        expectedPduLen = 2 + regCount * 2;
        break;
      case 0x05:
      case 0x06:
      case 0x0f:
      case 0x10:
        expectedPduLen = 5;
        break;
      // === ДОБАВЛЕНО ДЛЯ ТВОЕГО ПЛАГИНА ===
      case 0x55: // openFile: возвращает 5 байт PDU
        expectedPduLen = 5;
        break;
      case 0x57: // closeFile: возвращает 1 байт PDU
        expectedPduLen = 1;
        break;
      case 0x5a: // readFileChunk: длина переменная, возвращаем null
        return null;
      // ===================================
      default:
        return null;
    }

    return expectedPduLen + 3;
  }
}
