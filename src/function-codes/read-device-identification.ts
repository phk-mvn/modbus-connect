// src/function-codes/read-device-identification.ts

import { ReadDeviceIdentificationResponse } from '../types/modbus-types.js';

const FUNCTION_CODE = 0x2b;
const MEI_TYPE = 0x0e;
const MIN_RESPONSE_SIZE = 7;
const TEXT_ENCODING = 'windows-1251';

const TEXT_DECODER = new TextDecoder(TEXT_ENCODING);

/**
 * Строит PDU-запрос для чтения идентификации устройства
 * @param categoryId - категория идентификации (по умолчанию 0x01)
 * @param objectId - идентификатор объекта (по умолчанию 0x00)
 * @returns Uint8Array
 */
export function buildReadDeviceIdentificationRequest(
  categoryId: number = 0x01,
  objectId: number = 0x00
): Uint8Array {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint8(0, FUNCTION_CODE);
  view.setUint8(1, MEI_TYPE);
  view.setUint8(2, categoryId);
  view.setUint8(3, objectId);

  return new Uint8Array(buffer);
}

/**
 * Разбирает PDU-ответ с идентификацией устройства
 * @param pdu
 * @returns объект с информацией об идентификации
 * @throws Error При неверном формате ответа
 */
export function parseReadDeviceIdentificationResponse(
  pdu: Uint8Array
): ReadDeviceIdentificationResponse {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError('Response must be Uint8Array');
  }

  const responseLength = pdu.length;
  if (responseLength < MIN_RESPONSE_SIZE) {
    throw new Error(`Response too short: expected at least ${MIN_RESPONSE_SIZE} bytes`);
  }

  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }

  if (pdu[1] !== MEI_TYPE) {
    throw new Error(
      `Invalid MEI type: expected 0x${MEI_TYPE.toString(16)}, got 0x${pdu[1]?.toString(16)}`
    );
  }

  const result: ReadDeviceIdentificationResponse = {
    functionCode: pdu[0]!,
    meiType: pdu[1]!,
    category: pdu[2]!,
    conformityLevel: pdu[3]!,
    moreFollows: pdu[4]!,
    nextObjectId: pdu[5]!,
    numberOfObjects: pdu[6]!,
    objects: {},
  };

  let offset = 7;
  const numberOfObjects = result.numberOfObjects;

  for (let i = 0; i < numberOfObjects; i++) {
    if (offset + 2 > responseLength) {
      throw new Error('Invalid object header length');
    }

    const objectId = pdu[offset]!;
    const length = pdu[offset + 1]!;
    offset += 2;

    if (offset + length > responseLength) {
      throw new Error('Invalid object data length');
    }

    // Декодируем строку напрямую из буфера
    result.objects[objectId] = TEXT_DECODER.decode(
      new Uint8Array(pdu.buffer, pdu.byteOffset + offset, length)
    );
    offset += length;
  }

  return result;
}
