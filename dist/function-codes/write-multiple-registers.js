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
var write_multiple_registers_exports = {};
__export(write_multiple_registers_exports, {
  buildWriteMultipleRegistersRequest: () => buildWriteMultipleRegistersRequest,
  parseWriteMultipleRegistersResponse: () => parseWriteMultipleRegistersResponse
});
module.exports = __toCommonJS(write_multiple_registers_exports);
const FUNCTION_CODE = 16;
const MIN_REGISTERS = 1;
const MAX_REGISTERS = 123;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 65535;
const MIN_VALUE = 0;
const MAX_VALUE = 65535;
const REQUEST_HEADER_SIZE = 6;
const RESPONSE_SIZE = 5;
const UINT16_SIZE = 2;
function validateRegisterAddress(address) {
  if ((address | 0) !== address || address < MIN_ADDRESS || address > MAX_ADDRESS) {
    throw new RangeError(`Address must be ${MIN_ADDRESS}-${MAX_ADDRESS}, got ${address}`);
  }
}
function validateRegisterValue(value) {
  if ((value | 0) !== value || value < MIN_VALUE || value > MAX_VALUE) {
    throw new RangeError(`Value must be ${MIN_VALUE}-${MAX_VALUE}, got ${value}`);
  }
}
function buildWriteMultipleRegistersRequest(startAddress, values) {
  validateRegisterAddress(startAddress);
  const quantity = values.length;
  if (!Array.isArray(values) || !Number.isInteger(quantity) || quantity < MIN_REGISTERS || quantity > MAX_REGISTERS) {
    throw new RangeError(`Values count must be ${MIN_REGISTERS}-${MAX_REGISTERS}, got ${quantity}`);
  }
  for (let i = 0; i < quantity; i++) {
    validateRegisterValue(values[i]);
  }
  const byteCount = quantity * UINT16_SIZE;
  const buffer = new ArrayBuffer(REQUEST_HEADER_SIZE + byteCount);
  const view = new DataView(buffer);
  const pdu = new Uint8Array(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, startAddress, false);
  view.setUint16(3, quantity, false);
  view.setUint8(5, byteCount);
  for (let i = 0; i < quantity; i++) {
    view.setUint16(REQUEST_HEADER_SIZE + i * UINT16_SIZE, values[i], false);
  }
  return pdu;
}
function parseWriteMultipleRegistersResponse(pdu) {
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
  buildWriteMultipleRegistersRequest,
  parseWriteMultipleRegistersResponse
});
