// src/function-codes/report-slave-id.ts

import { ReportSlaveIdResponse } from '../types/modbus-types.js';

const FUNCTION_CODE = 0x11;
const MIN_RESPONSE_LENGTH = 4;
const HEADER_SIZE = 2;
const SLAVE_ID_OFFSET = 2;
const RUN_STATUS_OFFSET = 3;
const DATA_OFFSET = 4;

/**
 * Строит PDU запроса Report Slave ID (0x11)
 * @returns Uint8Array
 */
export function buildReportSlaveIdRequest(): Uint8Array {
  const buffer = new ArrayBuffer(1);
  const view = new DataView(buffer);
  view.setUint8(0, FUNCTION_CODE);
  return new Uint8Array(buffer);
}

/**
 * Разбирает PDU ответа на Report Slave ID
 * @param pdu
 * @returns { slaveId: number, isRunning: boolean, data: Uint8Array }
 * @throws Error При неверном формате ответа
 */
export function parseReportSlaveIdResponse(pdu: Uint8Array): ReportSlaveIdResponse {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError('PDU must be Uint8Array');
  }

  const pduLength = pdu.length;

  if (pduLength < MIN_RESPONSE_LENGTH) {
    throw new Error(
      `PDU too short for Report Slave ID response: expected at least ${MIN_RESPONSE_LENGTH}, got ${pduLength}`
    );
  }

  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }

  const byteCount = pdu[1]!;
  const expectedLength = byteCount + HEADER_SIZE;

  if (pduLength !== expectedLength) {
    throw new Error(`Invalid byte count: expected ${expectedLength}, got ${pduLength}`);
  }

  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;

  return {
    slaveId: pdu[SLAVE_ID_OFFSET]!,
    isRunning: pdu[RUN_STATUS_OFFSET]! === 0xff,
    data:
      byteCount > 2
        ? new Uint8Array(buffer, byteOffset + DATA_OFFSET, byteCount - 2)
        : new Uint8Array(0),
  };
}
