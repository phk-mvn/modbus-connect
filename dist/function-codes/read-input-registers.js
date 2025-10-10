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
var read_input_registers_exports = {};
__export(read_input_registers_exports, {
  buildReadInputRegistersRequest: () => buildReadInputRegistersRequest,
  parseReadInputRegistersResponse: () => parseReadInputRegistersResponse
});
module.exports = __toCommonJS(read_input_registers_exports);
const FUNCTION_CODE = 4;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 125;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;
const UINT16_SIZE = 2;
function buildReadInputRegistersRequest(startAddress, quantity) {
  if ((quantity | 0) !== quantity || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    throw new RangeError(`Quantity must be integer ${MIN_QUANTITY}-${MAX_QUANTITY}`);
  }
  const buffer = new Uint8Array(REQUEST_SIZE);
  buffer[0] = FUNCTION_CODE;
  buffer[1] = startAddress >>> 8;
  buffer[2] = startAddress & 255;
  buffer[3] = quantity >>> 8;
  buffer[4] = quantity & 255;
  return buffer;
}
function parseReadInputRegistersResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
  }
  const pduLength = pdu.length;
  if (pduLength < RESPONSE_HEADER_SIZE) {
    throw new Error("PDU too short");
  }
  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x04, got 0x${pdu[0]?.toString(16).padStart(2, "0")}`
    );
  }
  const byteCount = pdu[1];
  if (byteCount % UINT16_SIZE !== 0) {
    throw new Error(`Invalid byte count: must be multiple of ${UINT16_SIZE}`);
  }
  const expectedLength = RESPONSE_HEADER_SIZE + byteCount;
  if (pduLength !== expectedLength) {
    throw new Error(`Invalid PDU length: expected ${expectedLength}, got ${pduLength}`);
  }
  if (byteCount === 0) {
    return [];
  }
  const buffer = pdu.buffer || pdu;
  const byteOffset = (pdu.byteOffset || 0) + RESPONSE_HEADER_SIZE;
  const registerCount = byteCount / UINT16_SIZE;
  if (byteOffset % UINT16_SIZE === 0) {
    const uint16View = new Uint16Array(buffer, byteOffset, registerCount);
    return Array.from(uint16View);
  } else {
    const registers = new Array(registerCount);
    const view = new DataView(buffer, byteOffset, byteCount);
    for (let i = 0; i < registerCount; i++) {
      registers[i] = view.getUint16(i * UINT16_SIZE, false);
    }
    return registers;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReadInputRegistersRequest,
  parseReadInputRegistersResponse
});
