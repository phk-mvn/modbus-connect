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
var restart_controller_exports = {};
__export(restart_controller_exports, {
  buildRestartControllerRequest: () => buildRestartControllerRequest,
  parseRestartControllerResponse: () => parseRestartControllerResponse
});
module.exports = __toCommonJS(restart_controller_exports);
const FUNCTION_CODE = 92;
function buildRestartControllerRequest() {
  const request = new Uint8Array(1);
  request[0] = FUNCTION_CODE;
  return request;
}
function parseRestartControllerResponse(pdu = null) {
  if (pdu?.length) {
    const warning = `Unexpected ${pdu.length}-byte response for restart command`;
    return { success: true, warning };
  }
  return { success: true };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildRestartControllerRequest,
  parseRestartControllerResponse
});
