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
var write_multiple_coils_exports = {};
__export(write_multiple_coils_exports, {
  buildWriteMultipleCoilsRequest: () => buildWriteMultipleCoilsRequest,
  parseWriteMultipleCoilsResponse: () => parseWriteMultipleCoilsResponse
});
module.exports = __toCommonJS(write_multiple_coils_exports);
const FUNCTION_CODE = 15;
const MIN_COILS = 1;
const MAX_COILS = 1968;
const REQUEST_HEADER_SIZE = 6;
const RESPONSE_SIZE = 5;
function buildWriteMultipleCoilsRequest(startAddress, values) {
  const valueCount = values.length;
  if (!Array.isArray(values) || (valueCount | 0) !== valueCount || valueCount < MIN_COILS || valueCount > MAX_COILS) {
    throw new RangeError(`Values must be an array of ${MIN_COILS} to ${MAX_COILS} booleans`);
  }
  const byteCount = Math.ceil(valueCount / 8);
  const buffer = new ArrayBuffer(REQUEST_HEADER_SIZE + byteCount);
  const view = new DataView(buffer);
  const pdu = new Uint8Array(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, startAddress, false);
  view.setUint16(3, valueCount, false);
  view.setUint8(5, byteCount);
  for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
    let byteValue = 0;
    const startBit = byteIndex * 8;
    const endBit = Math.min(startBit + 8, valueCount);
    for (let bitIndex = startBit; bitIndex < endBit; bitIndex++) {
      if (values[bitIndex]) {
        byteValue |= 1 << bitIndex - startBit;
      }
    }
    pdu[REQUEST_HEADER_SIZE + byteIndex] = byteValue;
  }
  return pdu;
}
function parseWriteMultipleCoilsResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
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
  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;
  const view = new DataView(buffer, byteOffset, RESPONSE_SIZE);
  return {
    startAddress: view.getUint16(1, false),
    quantity: view.getUint16(3, false)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildWriteMultipleCoilsRequest,
  parseWriteMultipleCoilsResponse
});
