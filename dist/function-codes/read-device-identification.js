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
var read_device_identification_exports = {};
__export(read_device_identification_exports, {
  buildReadDeviceIdentificationRequest: () => buildReadDeviceIdentificationRequest,
  parseReadDeviceIdentificationResponse: () => parseReadDeviceIdentificationResponse
});
module.exports = __toCommonJS(read_device_identification_exports);
const FUNCTION_CODE = 43;
const MEI_TYPE = 14;
const MIN_RESPONSE_SIZE = 7;
const TEXT_ENCODING = "windows-1251";
const TEXT_DECODER = new TextDecoder(TEXT_ENCODING);
function buildReadDeviceIdentificationRequest(categoryId = 1, objectId = 0) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint8(0, FUNCTION_CODE);
  view.setUint8(1, MEI_TYPE);
  view.setUint8(2, categoryId);
  view.setUint8(3, objectId);
  return new Uint8Array(buffer);
}
function parseReadDeviceIdentificationResponse(pdu) {
  if (!(pdu instanceof Uint8Array)) {
    throw new TypeError("Response must be Uint8Array");
  }
  const responseLength = pdu.length;
  if (responseLength < MIN_RESPONSE_SIZE) {
    throw new Error(`Response too short: expected at least ${MIN_RESPONSE_SIZE} bytes`);
  }
  if (pdu[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0]?.toString(16)}`
    );
  }
  if (pdu[1] !== MEI_TYPE) {
    throw new Error(
      `Invalid MEI type: expected 0x${MEI_TYPE.toString(16)}, got 0x${pdu[1]?.toString(16)}`
    );
  }
  const result = {
    functionCode: pdu[0],
    meiType: pdu[1],
    category: pdu[2],
    conformityLevel: pdu[3],
    moreFollows: pdu[4],
    nextObjectId: pdu[5],
    numberOfObjects: pdu[6],
    objects: {}
  };
  let offset = 7;
  const numberOfObjects = result.numberOfObjects;
  for (let i = 0; i < numberOfObjects; i++) {
    if (offset + 2 > responseLength) {
      throw new Error("Invalid object header length");
    }
    const objectId = pdu[offset];
    const length = pdu[offset + 1];
    offset += 2;
    if (offset + length > responseLength) {
      throw new Error("Invalid object data length");
    }
    result.objects[objectId] = TEXT_DECODER.decode(
      new Uint8Array(pdu.buffer, pdu.byteOffset + offset, length)
    );
    offset += length;
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReadDeviceIdentificationRequest,
  parseReadDeviceIdentificationResponse
});
