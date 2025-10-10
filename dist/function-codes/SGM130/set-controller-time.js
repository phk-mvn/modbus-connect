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
var set_controller_time_exports = {};
__export(set_controller_time_exports, {
  buildSetControllerTimeRequest: () => buildSetControllerTimeRequest,
  parseSetControllerTimeResponse: () => parseSetControllerTimeResponse
});
module.exports = __toCommonJS(set_controller_time_exports);
const FUNCTION_CODE = 111;
const REQUEST_SIZE = 10;
const RESPONSE_MIN_SIZE = 1;
function buildSetControllerTimeRequest(time) {
  const buffer = new Uint8Array(REQUEST_SIZE);
  buffer[0] = FUNCTION_CODE;
  buffer[1] = 0;
  buffer[2] = 0;
  buffer[3] = time.seconds;
  buffer[4] = time.minutes;
  buffer[5] = time.hours;
  buffer[6] = time.day;
  buffer[7] = time.month;
  buffer[8] = time.year & 255;
  buffer[9] = time.year >> 8 & 255;
  return buffer;
}
function parseSetControllerTimeResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError(`Expected Uint8Array, got ${typeof pdu}`);
  }
  if (pdu.length < RESPONSE_MIN_SIZE || pdu[0] !== FUNCTION_CODE) {
    const receivedCode = pdu[0]?.toString(16).padStart(2, "0") || "null";
    throw new Error(
      `Invalid response: expected min ${RESPONSE_MIN_SIZE} byte(s) with FC=0x${FUNCTION_CODE.toString(16)}, got ${pdu.length} byte(s) with FC=0x${receivedCode}`
    );
  }
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSetControllerTimeRequest,
  parseSetControllerTimeResponse
});
