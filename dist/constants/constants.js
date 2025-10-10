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
var constants_exports = {};
__export(constants_exports, {
  EXCEPTION_CODES: () => EXCEPTION_CODES,
  FUNCTION_CODES: () => FUNCTION_CODES
});
module.exports = __toCommonJS(constants_exports);
const FUNCTION_CODES = {
  READ_COILS: 1,
  READ_DISCRETE_INPUTS: 2,
  READ_HOLDING_REGISTERS: 3,
  READ_INPUT_REGISTERS: 4,
  WRITE_SINGLE_COIL: 5,
  WRITE_SINGLE_REGISTER: 6,
  WRITE_MULTIPLE_COILS: 15,
  WRITE_MULTIPLE_REGISTERS: 16,
  REPORT_SLAVE_ID: 17,
  READ_DEVICE_COMMENT: 20,
  WRITE_DEVICE_COMMENT: 21,
  READ_DEVICE_IDENTIFICATION: 43,
  READ_FILE_LENGTH: 82,
  READ_FILE_CHUNK: 90,
  OPEN_FILE: 85,
  CLOSE_FILE: 87,
  RESTART_CONTROLLER: 92,
  GET_CONTROLLER_TIME: 110,
  SET_CONTROLLER_TIME: 111
};
const EXCEPTION_CODES = {
  1: "Illegal Function",
  2: "Illegal Data Address",
  3: "Illegal Data Value",
  4: "Slave Device Failure",
  5: "Acknowledge",
  6: "Slave Device Busy",
  8: "Memory Parity Error",
  10: "Gateway Path Unavailable",
  11: "Gateway Target Device Failed to Respond"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EXCEPTION_CODES,
  FUNCTION_CODES
});
