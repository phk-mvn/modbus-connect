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
var read_discrete_inputs_exports = {};
__export(read_discrete_inputs_exports, {
  buildReadDiscreteInputsRequest: () => buildReadDiscreteInputsRequest,
  parseReadDiscreteInputsResponse: () => parseReadDiscreteInputsResponse
});
module.exports = __toCommonJS(read_discrete_inputs_exports);
const FUNCTION_CODE = 2;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 2e3;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;
function buildReadDiscreteInputsRequest(startAddress, quantity) {
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
function parseReadDiscreteInputsResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
  }
  const pduLength = pdu.length;
  if (pduLength < RESPONSE_HEADER_SIZE) {
    throw new Error(`PDU too short: expected at least ${RESPONSE_HEADER_SIZE} bytes`);
  }
  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }
  const byteCount = pdu[1];
  const expectedLength = byteCount + RESPONSE_HEADER_SIZE;
  if (pduLength !== expectedLength) {
    throw new Error(`Invalid length: expected ${expectedLength}, got ${pduLength}`);
  }
  const quantity = pdu[3] << 8 | pdu[4];
  if (quantity > byteCount * 8) {
    throw new Error(`Invalid quantity: ${quantity} exceeds byte capacity`);
  }
  const bits = new Array(quantity);
  let bitIndex = 0;
  const dataStart = RESPONSE_HEADER_SIZE;
  for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
    const byte = pdu[dataStart + byteIndex];
    const maxBits = Math.min(8, quantity - bitIndex);
    if (maxBits > 0) bits[bitIndex++] = (byte & 1 << 0) !== 0;
    if (maxBits > 1) bits[bitIndex++] = (byte & 1 << 1) !== 0;
    if (maxBits > 2) bits[bitIndex++] = (byte & 1 << 2) !== 0;
    if (maxBits > 3) bits[bitIndex++] = (byte & 1 << 3) !== 0;
    if (maxBits > 4) bits[bitIndex++] = (byte & 1 << 4) !== 0;
    if (maxBits > 5) bits[bitIndex++] = (byte & 1 << 5) !== 0;
    if (maxBits > 6) bits[bitIndex++] = (byte & 1 << 6) !== 0;
    if (maxBits > 7) bits[bitIndex++] = (byte & 1 << 7) !== 0;
  }
  return bits;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReadDiscreteInputsRequest,
  parseReadDiscreteInputsResponse
});
