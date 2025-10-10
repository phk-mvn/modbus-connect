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
var closeFile_exports = {};
__export(closeFile_exports, {
  buildCloseFileRequest: () => buildCloseFileRequest,
  parseCloseFileResponse: () => parseCloseFileResponse
});
module.exports = __toCommonJS(closeFile_exports);
const FUNCTION_CODE = 87;
function buildCloseFileRequest() {
  const request = new Uint8Array(1);
  request[0] = FUNCTION_CODE;
  return request;
}
function parseCloseFileResponse(response) {
  if (!(response instanceof Uint8Array)) {
    throw new TypeError("Response must be Uint8Array");
  }
  if (response.length === 0) {
    return true;
  }
  if (response[0] !== FUNCTION_CODE) {
    throw new Error(
      `Invalid response: expected [0x${FUNCTION_CODE.toString(16)}], got [0x${response[0]?.toString(16)}]`
    );
  }
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildCloseFileRequest,
  parseCloseFileResponse
});
