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
var get_controller_time_exports = {};
__export(get_controller_time_exports, {
  buildGetControllerTimeRequest: () => buildGetControllerTimeRequest,
  parseGetControllerTimeResponse: () => parseGetControllerTimeResponse
});
module.exports = __toCommonJS(get_controller_time_exports);
const FUNCTION_CODE = 110;
const EXPECTED_RESPONSE_SIZE = 10;
const DATA_OFFSET = 3;
const TIME_FIELDS_OFFSET = Object.freeze({
  SECONDS: 0,
  MINUTES: 1,
  HOURS: 2,
  DAY: 3,
  MONTH: 4,
  YEAR_LOW: 5,
  YEAR_HIGH: 6
});
function buildGetControllerTimeRequest() {
  const request = new Uint8Array([FUNCTION_CODE]);
  return request;
}
function parseGetControllerTimeResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError(`Expected Uint8Array, got ${typeof pdu}`);
  }
  if (pdu.length !== EXPECTED_RESPONSE_SIZE || pdu[0] !== FUNCTION_CODE) {
    const hexCode = pdu[0]?.toString(16).padStart(2, "0") || "null";
    throw new Error(
      `Invalid response: expected ${EXPECTED_RESPONSE_SIZE} bytes with FC=0x${FUNCTION_CODE.toString(16)}, got ${pdu.length} bytes with FC=0x${hexCode}`
    );
  }
  const buffer = pdu.buffer || pdu;
  const byteOffset = (pdu.byteOffset || 0) + DATA_OFFSET;
  let seconds, minutes, hours, day, month, year;
  if (byteOffset % 1 === 0) {
    const dataView = new Uint8Array(buffer, byteOffset, 7);
    seconds = dataView[TIME_FIELDS_OFFSET.SECONDS];
    minutes = dataView[TIME_FIELDS_OFFSET.MINUTES];
    hours = dataView[TIME_FIELDS_OFFSET.HOURS];
    day = dataView[TIME_FIELDS_OFFSET.DAY];
    month = dataView[TIME_FIELDS_OFFSET.MONTH];
    year = dataView[TIME_FIELDS_OFFSET.YEAR_LOW] | dataView[TIME_FIELDS_OFFSET.YEAR_HIGH] << 8;
  } else {
    const view = new DataView(buffer, byteOffset);
    seconds = view.getUint8(TIME_FIELDS_OFFSET.SECONDS);
    minutes = view.getUint8(TIME_FIELDS_OFFSET.MINUTES);
    hours = view.getUint8(TIME_FIELDS_OFFSET.HOURS);
    day = view.getUint8(TIME_FIELDS_OFFSET.DAY);
    month = view.getUint8(TIME_FIELDS_OFFSET.MONTH);
    year = view.getUint8(TIME_FIELDS_OFFSET.YEAR_LOW) | view.getUint8(TIME_FIELDS_OFFSET.YEAR_HIGH) << 8;
  }
  return { seconds, minutes, hours, day, month, year };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildGetControllerTimeRequest,
  parseGetControllerTimeResponse
});
