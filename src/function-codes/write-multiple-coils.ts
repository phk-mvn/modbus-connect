// src/function-codes/write-multiple-coils.ts

import { WriteMultipleCoilsResponse } from '../types/modbus-types.js';

const FUNCTION_CODE = 0x0f;
const MIN_COILS = 1;
const MAX_COILS = 0x07b0;
const REQUEST_HEADER_SIZE = 6;
const RESPONSE_SIZE = 5;

/**
 * Строит PDU-запрос для записи множества катушек (Write Multiple Coils)
 * @param startAddress - начальный адрес
 * @param values - массив значений катушек (true/false)
 * @returns Uint8Array
 * @throws RangeError Если количество катушек вне допустимого диапазона
 */
export function buildWriteMultipleCoilsRequest(
  startAddress: number,
  values: boolean[]
): Uint8Array {
  const valueCount = values.length;

  // Быстрая проверка через побитовые операции
  if (
    !Array.isArray(values) ||
    (valueCount | 0) !== valueCount ||
    valueCount < MIN_COILS ||
    valueCount > MAX_COILS
  ) {
    throw new RangeError(`Values must be an array of ${MIN_COILS} to ${MAX_COILS} booleans`);
  }

  const byteCount = Math.ceil(valueCount / 8);
  const buffer = new ArrayBuffer(REQUEST_HEADER_SIZE + byteCount);
  const view = new DataView(buffer);
  const pdu = new Uint8Array(buffer);

  // Записываем заголовок
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, startAddress, false);
  view.setUint16(3, valueCount, false);
  view.setUint8(5, byteCount);

  // Оптимизированная упаковка битов с предварительным вычислением границ
  for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
    let byteValue = 0;
    const startBit = byteIndex * 8;
    const endBit = Math.min(startBit + 8, valueCount);

    for (let bitIndex = startBit; bitIndex < endBit; bitIndex++) {
      if (values[bitIndex]!) {
        byteValue |= 1 << (bitIndex - startBit);
      }
    }
    pdu[REQUEST_HEADER_SIZE + byteIndex] = byteValue;
  }

  return pdu;
}

/**
 * Разбирает PDU-ответ на запись множества катушек
 * @param pdu
 * @returns { startAddress: number, quantity: number }
 * @throws TypeError Если PDU не является Uint8Array
 * @throws Error Если PDU имеет неправильную длину или код функции
 */
export function parseWriteMultipleCoilsResponse(pdu: Uint8Array): WriteMultipleCoilsResponse {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError('PDU must be Uint8Array');
  }

  const pduLength = pdu.length;
  if (pduLength !== RESPONSE_SIZE) {
    throw new Error(`Invalid PDU length: expected ${RESPONSE_SIZE} bytes, got ${pduLength}`);
  }

  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }

  // Используем оригинальный буфер без копирования
  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;
  const view = new DataView(buffer, byteOffset, RESPONSE_SIZE);

  return {
    startAddress: view.getUint16(1, false),
    quantity: view.getUint16(3, false),
  };
}
