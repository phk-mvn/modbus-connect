// src/function-codes/write-single-register.ts

import { WriteSingleRegisterResponse } from '../types/modbus-types.js';

const FUNCTION_CODE = 0x06;
const PDU_SIZE = 5;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 0xffff;
const MIN_VALUE = 0;
const MAX_VALUE = 0xffff;

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
 * Строит PDU-запрос для записи одного регистра (Write Single Register)
 * @param address - адрес регистра
 * @param value - значение регистра
 * @returns Uint8Array
 * @throws RangeError Если адрес или значение регистра вне допустимого диапазона
 */
export function buildWriteSingleRegisterRequest(address: number, value: number): Uint8Array {
  validateRegisterAddress(address);
  validateRegisterValue(value);

  const buffer = new ArrayBuffer(PDU_SIZE);
  const view = new DataView(buffer);

  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, address, false);
  view.setUint16(3, value, false);

  return new Uint8Array(buffer);
}

/**
 * Разбирает PDU-ответ на запись одного регистра
 * @param pdu
 * @returns { address: number, value: number }
 * @throws TypeError Если PDU не является Uint8Array
 * @throws Error Если PDU имеет неправильную длину или код функции
 */
export function parseWriteSingleRegisterResponse(pdu: Uint8Array): WriteSingleRegisterResponse {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError(`PDU must be Uint8Array, got ${typeof pdu}`);
  }

  const pduLength = pdu.length;
  if (pduLength !== PDU_SIZE) {
    throw new Error(`Invalid PDU length: expected ${PDU_SIZE}, got ${pduLength}`);
  }

  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }

  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;
  const view = new DataView(buffer, byteOffset, PDU_SIZE);

  return {
    address: view.getUint16(1, false),
    value: view.getUint16(3, false),
  };
}
