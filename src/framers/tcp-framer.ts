// src/framers/tcp-framer.ts

import { ModbusFramer, FramerContext } from './modbus-framer.js';
import { concatUint8Arrays, sliceUint8Array } from '../utils/utils.js';
import { ModbusInvalidTransactionIdError, ModbusResponseError } from '../errors.js';

export class TcpFramer implements ModbusFramer {
  private _transactionId: number = 0;

  /**
   * Генерирует следующий Transaction ID (0-65535)
   */
  private _getNextTransactionId(): number {
    this._transactionId = (this._transactionId + 1) % 65536;
    return this._transactionId;
  }

  public buildAdu(unitId: number, pdu: Uint8Array): Uint8Array {
    const tid = this._getNextTransactionId();
    const mbap = new Uint8Array(7);
    const view = new DataView(mbap.buffer);

    // MBAP Header:
    view.setUint16(0, tid, false); // Transaction ID (2 байта)
    view.setUint16(2, 0, false); // Protocol ID (всегда 0 для Modbus)
    view.setUint16(4, pdu.length + 1, false); // Length (PDU + 1 байт UnitID)
    view.setUint8(6, unitId); // Unit ID (Slave ID)

    return concatUint8Arrays([mbap, pdu]);
  }

  public parseAdu(packet: Uint8Array, context?: FramerContext) {
    if (packet.length < 7) {
      throw new ModbusResponseError('Invalid TCP packet: too short for MBAP');
    }

    const view = new DataView(packet.buffer, packet.byteOffset, 7);
    const receivedTid = view.getUint16(0, false);
    const protocolId = view.getUint16(2, false);
    const unitId = view.getUint8(6);

    // Валидация протокола
    if (protocolId !== 0) {
      throw new ModbusResponseError(`Invalid Protocol ID: ${protocolId}`);
    }

    // Валидация Transaction ID (если контекст передан)
    if (context?.transactionId !== undefined && receivedTid !== context.transactionId) {
      throw new ModbusInvalidTransactionIdError(receivedTid, context.transactionId);
    }

    return {
      unitId,
      pdu: sliceUint8Array(packet, 7),
    };
  }

  /**
   * Возвращает текущий ID транзакции (нужен для контекста при разборе)
   */
  public get currentTransactionId(): number {
    return this._transactionId;
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
      default:
        return null;
    }

    // TCP ADU = PDU + MBAP(7)
    return expectedPduLen + 7;
  }
}
