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
var openFile_exports = {};
__export(openFile_exports, {
  buildOpenFileRequest: () => buildOpenFileRequest,
  parseOpenFileResponse: () => parseOpenFileResponse
});
module.exports = __toCommonJS(openFile_exports);
const FUNCTION_CODE = 85;
const MAX_FILENAME_LENGTH = 250;
const RESPONSE_SIZE = 5;
function buildOpenFileRequest(filename) {
  if (typeof filename !== "string") {
    throw new TypeError("Filename must be a string");
  }
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);
  if (filenameBytes.length === 0 || filenameBytes.length > MAX_FILENAME_LENGTH) {
    throw new RangeError(
      `Filename length must be 1-${MAX_FILENAME_LENGTH} bytes, got ${filenameBytes.length}`
    );
  }
  const byteCount = filenameBytes.length + 1;
  const bufferSize = 2 + byteCount;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  const pdu = new Uint8Array(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint8(1, byteCount);
  pdu.set(filenameBytes, 2);
  pdu[2 + filenameBytes.length] = 0;
  return pdu;
}
function parseOpenFileResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("PDU must be Uint8Array");
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
  const fileLength = pdu[1] << 24 | pdu[2] << 16 | pdu[3] << 8 | pdu[4];
  return {
    fileLength
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildOpenFileRequest,
  parseOpenFileResponse
});
