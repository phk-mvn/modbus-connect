/**
 * Утилита для управления Transaction ID (0-65535)
 */
export class TransactionCounter {
  private _currentId: number = 0;

  next(): number {
    this._currentId = (this._currentId + 1) % 65536;
    return this._currentId;
  }

  get current(): number {
    return this._currentId;
  }
}

/**
 * Формирует MBAP заголовок (7 байт)
 * @param transactionId - ID транзакции (2 байта)
 * @param unitId - ID устройства (1 байт)
 * @param pduLength - Длина PDU
 */
export function buildMbapHeader(
  transactionId: number,
  unitId: number,
  pduLength: number
): Uint8Array {
  const header = new Uint8Array(7);
  const view = new DataView(header.buffer);

  view.setUint16(0, transactionId, false); // Transaction ID (BE)
  view.setUint16(2, 0, false); // Protocol ID: всегда 0 для Modbus (BE)
  view.setUint16(4, pduLength + 1, false); // Length: PDU + 1 байт UnitID (BE)
  view.setUint8(6, unitId); // Unit ID

  return header;
}

/**
 * Разбирает MBAP заголовок
 */
export function parseMbapHeader(data: Uint8Array) {
  if (data.length < 7) throw new Error('MBAP header too short');

  const view = new DataView(data.buffer, data.byteOffset, 7);
  return {
    transactionId: view.getUint16(0, false),
    protocolId: view.getUint16(2, false),
    length: view.getUint16(4, false),
    unitId: view.getUint8(6),
  };
}
