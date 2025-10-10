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
var read_file_length_exports = {};
__export(read_file_length_exports, {
  buildReadFileLengthRequest: () => buildReadFileLengthRequest,
  parseReadFileLengthResponse: () => parseReadFileLengthResponse
});
module.exports = __toCommonJS(read_file_length_exports);
const FUNCTION_CODE = 82;
const MAX_FILENAME_LENGTH = 250;
const RESPONSE_SIZE = 5;
const FILE_NOT_FOUND = 4294967295;
const textEncoder = new TextEncoder();
function buildReadFileLengthRequest(filename) {
  const nameBytes = textEncoder.encode(filename);
  const nameLength = nameBytes.length;
  if (nameLength > MAX_FILENAME_LENGTH) {
    throw new Error(`Filename exceeds ${MAX_FILENAME_LENGTH} bytes`);
  }
  const pdu = new Uint8Array(2 + nameLength + 1);
  pdu[0] = FUNCTION_CODE;
  pdu[1] = nameLength;
  pdu.set(nameBytes, 2);
  pdu[pdu.length - 1] = 0;
  return pdu;
}
function parseReadFileLengthResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError(`Expected Uint8Array, got ${typeof pdu}`);
  }
  if (pdu.length !== RESPONSE_SIZE || pdu[0] !== FUNCTION_CODE) {
    const receivedCode = pdu[0]?.toString(16).padStart(2, "0") || "null";
    throw new Error(
      `Invalid response: expected ${RESPONSE_SIZE} bytes (FC=0x${FUNCTION_CODE.toString(16)}), got ${pdu.length} bytes (FC=0x${receivedCode})`
    );
  }
  const buffer = pdu.buffer || pdu;
  const byteOffset = pdu.byteOffset || 0;
  let length;
  if (byteOffset % 4 === 0) {
    length = new Uint32Array(buffer, byteOffset + 1, 1)[0];
  } else {
    length = new DataView(buffer, byteOffset).getUint32(1, false);
  }
  return length === FILE_NOT_FOUND ? -1 : length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReadFileLengthRequest,
  parseReadFileLengthResponse
});
