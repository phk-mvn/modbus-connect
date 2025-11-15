// src/function-codes/SGM130/restart-controller.ts

import { RestartControllerResponse } from '../../types/modbus-types.js';

const FUNCTION_CODE = 0x5c;

/**
 * Строит PDU запроса на перезапуск контроллера
 * @returns Uint8Array - PDU запроса (ровно 1 байт)
 */
export function buildRestartControllerRequest(): Uint8Array {
  const request = new Uint8Array(1);
  request[0] = FUNCTION_CODE;
  return request;
}

/**
 * Обрабатывает ответ на команду перезапуска (по спецификации ответа быть не должно)
 * @param pdu - Полученный PDU ответа (если есть)
 * @returns { success: boolean, warning?: string }
 */
export function parseRestartControllerResponse(
  pdu: Uint8Array | null = null
): RestartControllerResponse {
  if (pdu?.length) {
    const warning = `Unexpected ${pdu.length}-byte response for restart command`;
    return { success: true, warning };
  }
  return { success: true };
}
