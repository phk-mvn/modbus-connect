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
var read_holding_registers_exports = {};
__export(read_holding_registers_exports, {
  buildReadHoldingRegistersRequest: () => buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse: () => parseReadHoldingRegistersResponse
});
module.exports = __toCommonJS(read_holding_registers_exports);
const FUNCTION_CODE = 3;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 125;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;
const UINT16_SIZE = 2;
function buildReadHoldingRegistersRequest(startAddress, quantity) {
  if ((quantity | 0) !== quantity || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    throw new RangeError(`Quantity must be integer ${MIN_QUANTITY}-${MAX_QUANTITY}`);
  }
  const buffer = new ArrayBuffer(REQUEST_SIZE);
  const view = new DataView(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, startAddress, false);
  view.setUint16(3, quantity, false);
  return new Uint8Array(buffer);
}
function parseReadHoldingRegistersResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
  }
  const pduLength = pdu.length;
  if (pduLength < RESPONSE_HEADER_SIZE) {
    throw new Error("PDU too short");
  }
  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(`Invalid function code: expected 0x03, got 0x${pdu[0]?.toString(16)}`);
  }
  const byteCount = pdu[1];
  const expectedLength = byteCount + RESPONSE_HEADER_SIZE;
  if (pduLength !== expectedLength) {
    throw new Error(`Invalid length: expected ${expectedLength}, got ${pduLength}`);
  }
  if (byteCount === 0) {
    return [];
  }
  const buffer = pdu.buffer || pdu;
  const byteOffset = (pdu.byteOffset || 0) + RESPONSE_HEADER_SIZE;
  const registerCount = byteCount / UINT16_SIZE;
  const registers = new Array(registerCount);
  if (byteOffset % UINT16_SIZE === 0) {
    const uint16View = new Uint16Array(buffer, byteOffset, registerCount);
    for (let i = 0; i < registerCount; i++) {
      registers[i] = uint16View[i];
    }
  } else {
    const view = new DataView(
      buffer,
      byteOffset - RESPONSE_HEADER_SIZE,
      byteCount + RESPONSE_HEADER_SIZE
    );
    for (let i = 0; i < registerCount; i++) {
      registers[i] = view.getUint16(RESPONSE_HEADER_SIZE + i * UINT16_SIZE, false);
    }
  }
  return registers;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse
});
