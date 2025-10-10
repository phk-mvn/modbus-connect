"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var report_slave_id_exports = {};
__export(report_slave_id_exports, {
  buildReportSlaveIdRequest: () => buildReportSlaveIdRequest,
  parseReportSlaveIdResponse: () => parseReportSlaveIdResponse
});
module.exports = __toCommonJS(report_slave_id_exports);
const FUNCTION_CODE = 17;
const MIN_RESPONSE_LENGTH = 4;
const HEADER_SIZE = 2;
const SLAVE_ID_OFFSET = 2;
const RUN_STATUS_OFFSET = 3;
const DATA_OFFSET = 4;
function buildReportSlaveIdRequest() {
  const buffer = new ArrayBuffer(1);
  const view = new DataView(buffer);
  view.setUint8(0, FUNCTION_CODE);
  return new Uint8Array(buffer);
}
function parseReportSlaveIdResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
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
  const byteCount = pdu[1];
  const expectedLength = byteCount + HEADER_SIZE;
  if (pduLength !== expectedLength) {
    throw new Error(`Invalid byte count: expected ${expectedLength}, got ${pduLength}`);
  }
  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;
  return {
    slaveId: pdu[SLAVE_ID_OFFSET],
    // Прямой доступ к Uint8Array быстрее, чем DataView для 8-битных значений
    isRunning: pdu[RUN_STATUS_OFFSET] === 255,
    data: byteCount > 2 ? new Uint8Array(buffer, byteOffset + DATA_OFFSET, byteCount - 2) : new Uint8Array(0)
    // Возвращаем пустой массив если нет данных
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReportSlaveIdRequest,
  parseReportSlaveIdResponse
});
