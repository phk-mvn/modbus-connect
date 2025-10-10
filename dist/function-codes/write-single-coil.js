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
var write_single_coil_exports = {};
__export(write_single_coil_exports, {
  buildWriteSingleCoilRequest: () => buildWriteSingleCoilRequest,
  parseWriteSingleCoilResponse: () => parseWriteSingleCoilResponse
});
module.exports = __toCommonJS(write_single_coil_exports);
const FUNCTION_CODE = 5;
const COIL_ON = 65280;
const COIL_OFF = 0;
const PDU_SIZE = 5;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 65535;
function validateCoilAddress(address) {
  if ((address | 0) !== address || address < MIN_ADDRESS || address > MAX_ADDRESS) {
    throw new RangeError(`Address must be ${MIN_ADDRESS}-${MAX_ADDRESS}, got ${address}`);
  }
}
function validateCoilValue(value) {
  if (typeof value === "boolean" ? !value : value !== (value | 0)) {
    throw new TypeError(`Value must be boolean or 0/1, got ${typeof value} ${value}`);
  }
}
function buildWriteSingleCoilRequest(address, value) {
  validateCoilAddress(address);
  validateCoilValue(value);
  const buffer = new ArrayBuffer(PDU_SIZE);
  const view = new DataView(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint16(1, address, false);
  view.setUint16(3, value ? COIL_ON : COIL_OFF, false);
  return new Uint8Array(buffer);
}
function parseWriteSingleCoilResponse(pdu) {
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
  const address = view.getUint16(1, false);
  const valueRaw = view.getUint16(3, false);
  switch (valueRaw) {
    case COIL_ON:
      return { address, value: true };
    case COIL_OFF:
      return { address, value: false };
    default:
      throw new Error(
        `Invalid coil value: expected 0x${COIL_ON.toString(16)} or 0x${COIL_OFF.toString(16)}, got 0x${valueRaw.toString(16)}`
      );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildWriteSingleCoilRequest,
  parseWriteSingleCoilResponse
});
