// src/function-codes/write-multiple-registers.ts

import { WriteMultipleRegistersResponse } from '../types/modbus-types.js';

const FUNCTION_CODE = 0x10;
const MIN_REGISTERS = 1;
const MAX_REGISTERS = 0x7b;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 0xffff;
const MIN_VALUE = 0;
const MAX_VALUE = 0xffff;
const REQUEST_HEADER_SIZE = 6;
const RESPONSE_SIZE = 5;
const UINT16_SIZE = 2;

/**
 * Валидация адреса регистра
 * @param address - адрес регистра
 */
function validateRegisterAddress(address: number): void {
  if ((address | 0) !== address || address < MIN_ADDRESS || address > MAX_ADDRESS) {
    throw new RangeError(`Address must be ${MIN_ADDRESS}-${MAX_ADDRESS}, got ${address}`);
  }
}

/**
 * Валидация значения регистра
 * @param value - значение регистра
 */
function validateRegisterValue(value: number): void {
  if ((value | 0) !== value || value < MIN_VALUE || value > MAX_VALUE) {
    throw new RangeError(`Value must be ${MIN_VALUE}-${MAX_VALUE}, got ${value}`);
  }
}

/**
 * Строит PDU-запрос для записи множества регистров (Write Multiple Registers)
 * @param startAddress - начальный адрес
 * @param values - массив значений регистров
 * @returns Uint8Array
 * @throws RangeError Если количество регистров или их значения вне допустимого диапазона
 */
export function buildWriteMultipleRegistersRequest(
  startAddress: number,
  values: number[]
): Uint8Array {
  // Валидация параметров
  validateRegisterAddress(startAddress);

  const quantity = values.length;
  // Проверка длины массива
  if (
    !Array.isArray(values) ||
    !Number.isInteger(quantity) ||
    quantity < MIN_REGISTERS ||
    quantity > MAX_REGISTERS
  ) {
    throw new RangeError(`Values count must be ${MIN_REGISTERS}-${MAX_REGISTERS}, got ${quantity}`);
  }

  // Проверка каждого значения в массиве
  for (let i = 0; i < quantity; i++) {
    validateRegisterValue(values[i]!);
  }

  const byteCount = quantity * UINT16_SIZE;
  const buffer = new ArrayBuffer(REQUEST_HEADER_SIZE + byteCount);
  const view = new DataView(buffer);
  const pdu = new Uint8Array(buffer);

  // Заполняем заголовок PDU
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, startAddress, false);
  view.setUint16(3, quantity, false);
  view.setUint8(5, byteCount);

  // Оптимизированная запись значений
  for (let i = 0; i < quantity; i++) {
    view.setUint16(REQUEST_HEADER_SIZE + i * UINT16_SIZE, values[i]!, false);
  }

  return pdu;
}

/**
 * Разбирает PDU-ответ на запись множества регистров
 * @param pdu
 * @returns { startAddress: number, quantity: number }
 * @throws TypeError Если PDU не является Uint8Array
 * @throws Error Если PDU имеет неправильную длину или код функции
 */
export function parseWriteMultipleRegistersResponse(
  pdu: Uint8Array
): WriteMultipleRegistersResponse {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError(`PDU must be Uint8Array, got ${typeof pdu}`);
  }

  const pduLength = pdu.length;
  if (pduLength !== RESPONSE_SIZE) {
    throw new Error(`Invalid PDU length: expected ${RESPONSE_SIZE}, got ${pduLength}`);
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
