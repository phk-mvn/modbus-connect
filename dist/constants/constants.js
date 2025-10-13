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
  MODBUS_EXCEPTION_MESSAGES: () => MODBUS_EXCEPTION_MESSAGES,
  ModbusExceptionCode: () => ModbusExceptionCode,
  ModbusFunctionCode: () => ModbusFunctionCode,
  RegisterType: () => RegisterType
});
module.exports = __toCommonJS(constants_exports);
var ModbusFunctionCode = /* @__PURE__ */ ((ModbusFunctionCode2) => {
  ModbusFunctionCode2[ModbusFunctionCode2["READ_COILS"] = 1] = "READ_COILS";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_DISCRETE_INPUTS"] = 2] = "READ_DISCRETE_INPUTS";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_HOLDING_REGISTERS"] = 3] = "READ_HOLDING_REGISTERS";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_INPUT_REGISTERS"] = 4] = "READ_INPUT_REGISTERS";
  ModbusFunctionCode2[ModbusFunctionCode2["WRITE_SINGLE_COIL"] = 5] = "WRITE_SINGLE_COIL";
  ModbusFunctionCode2[ModbusFunctionCode2["WRITE_SINGLE_REGISTER"] = 6] = "WRITE_SINGLE_REGISTER";
  ModbusFunctionCode2[ModbusFunctionCode2["WRITE_MULTIPLE_COILS"] = 15] = "WRITE_MULTIPLE_COILS";
  ModbusFunctionCode2[ModbusFunctionCode2["WRITE_MULTIPLE_REGISTERS"] = 16] = "WRITE_MULTIPLE_REGISTERS";
  ModbusFunctionCode2[ModbusFunctionCode2["REPORT_SLAVE_ID"] = 17] = "REPORT_SLAVE_ID";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_DEVICE_COMMENT"] = 20] = "READ_DEVICE_COMMENT";
  ModbusFunctionCode2[ModbusFunctionCode2["WRITE_DEVICE_COMMENT"] = 21] = "WRITE_DEVICE_COMMENT";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_DEVICE_IDENTIFICATION"] = 43] = "READ_DEVICE_IDENTIFICATION";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_FILE_LENGTH"] = 82] = "READ_FILE_LENGTH";
  ModbusFunctionCode2[ModbusFunctionCode2["READ_FILE_CHUNK"] = 90] = "READ_FILE_CHUNK";
  ModbusFunctionCode2[ModbusFunctionCode2["OPEN_FILE"] = 85] = "OPEN_FILE";
  ModbusFunctionCode2[ModbusFunctionCode2["CLOSE_FILE"] = 87] = "CLOSE_FILE";
  ModbusFunctionCode2[ModbusFunctionCode2["RESTART_CONTROLLER"] = 92] = "RESTART_CONTROLLER";
  ModbusFunctionCode2[ModbusFunctionCode2["GET_CONTROLLER_TIME"] = 110] = "GET_CONTROLLER_TIME";
  ModbusFunctionCode2[ModbusFunctionCode2["SET_CONTROLLER_TIME"] = 111] = "SET_CONTROLLER_TIME";
  return ModbusFunctionCode2;
})(ModbusFunctionCode || {});
var ModbusExceptionCode = /* @__PURE__ */ ((ModbusExceptionCode2) => {
  ModbusExceptionCode2[ModbusExceptionCode2["ILLEGAL_FUNCTION"] = 1] = "ILLEGAL_FUNCTION";
  ModbusExceptionCode2[ModbusExceptionCode2["ILLEGAL_DATA_ADDRESS"] = 2] = "ILLEGAL_DATA_ADDRESS";
  ModbusExceptionCode2[ModbusExceptionCode2["ILLEGAL_DATA_VALUE"] = 3] = "ILLEGAL_DATA_VALUE";
  ModbusExceptionCode2[ModbusExceptionCode2["SLAVE_DEVICE_FAILURE"] = 4] = "SLAVE_DEVICE_FAILURE";
  ModbusExceptionCode2[ModbusExceptionCode2["ACKNOWLEDGE"] = 5] = "ACKNOWLEDGE";
  ModbusExceptionCode2[ModbusExceptionCode2["SLAVE_DEVICE_BUSY"] = 6] = "SLAVE_DEVICE_BUSY";
  ModbusExceptionCode2[ModbusExceptionCode2["MEMORY_PARITY_ERROR"] = 8] = "MEMORY_PARITY_ERROR";
  ModbusExceptionCode2[ModbusExceptionCode2["GATEWAY_PATH_UNAVAILABLE"] = 10] = "GATEWAY_PATH_UNAVAILABLE";
  ModbusExceptionCode2[ModbusExceptionCode2["GATEWAY_TARGET_DEVICE_FAILED"] = 11] = "GATEWAY_TARGET_DEVICE_FAILED";
  return ModbusExceptionCode2;
})(ModbusExceptionCode || {});
const MODBUS_EXCEPTION_MESSAGES = {
  [1 /* ILLEGAL_FUNCTION */]: "Illegal Function",
  [2 /* ILLEGAL_DATA_ADDRESS */]: "Illegal Data Address",
  [3 /* ILLEGAL_DATA_VALUE */]: "Illegal Data Value",
  [4 /* SLAVE_DEVICE_FAILURE */]: "Slave Device Failure",
  [5 /* ACKNOWLEDGE */]: "Acknowledge",
  [6 /* SLAVE_DEVICE_BUSY */]: "Slave Device Busy",
  [8 /* MEMORY_PARITY_ERROR */]: "Memory Parity Error",
  [10 /* GATEWAY_PATH_UNAVAILABLE */]: "Gateway Path Unavailable",
  [11 /* GATEWAY_TARGET_DEVICE_FAILED */]: "Gateway Target Device Failed to Respond"
};
var RegisterType = /* @__PURE__ */ ((RegisterType2) => {
  RegisterType2["UINT16"] = "uint16";
  RegisterType2["INT16"] = "int16";
  RegisterType2["UINT32"] = "uint32";
  RegisterType2["INT32"] = "int32";
  RegisterType2["FLOAT"] = "float";
  RegisterType2["UINT32_LE"] = "uint32_le";
  RegisterType2["INT32_LE"] = "int32_le";
  RegisterType2["FLOAT_LE"] = "float_le";
  RegisterType2["UINT32_SW"] = "uint32_sw";
  RegisterType2["INT32_SW"] = "int32_sw";
  RegisterType2["FLOAT_SW"] = "float_sw";
  RegisterType2["UINT32_SB"] = "uint32_sb";
  RegisterType2["INT32_SB"] = "int32_sb";
  RegisterType2["FLOAT_SB"] = "float_sb";
  RegisterType2["UINT32_SBW"] = "uint32_sbw";
  RegisterType2["INT32_SBW"] = "int32_sbw";
  RegisterType2["FLOAT_SBW"] = "float_sbw";
  RegisterType2["UINT32_LE_SW"] = "uint32_le_sw";
  RegisterType2["INT32_LE_SW"] = "int32_le_sw";
  RegisterType2["FLOAT_LE_SW"] = "float_le_sw";
  RegisterType2["UINT32_LE_SB"] = "uint32_le_sb";
  RegisterType2["INT32_LE_SB"] = "int32_le_sb";
  RegisterType2["FLOAT_LE_SB"] = "float_le_sb";
  RegisterType2["UINT32_LE_SBW"] = "uint32_le_sbw";
  RegisterType2["INT32_LE_SBW"] = "int32_le_sbw";
  RegisterType2["FLOAT_LE_SBW"] = "float_le_sbw";
  RegisterType2["UINT64"] = "uint64";
  RegisterType2["INT64"] = "int64";
  RegisterType2["DOUBLE"] = "double";
  RegisterType2["UINT64_LE"] = "uint64_le";
  RegisterType2["INT64_LE"] = "int64_le";
  RegisterType2["DOUBLE_LE"] = "double_le";
  RegisterType2["HEX"] = "hex";
  RegisterType2["STRING"] = "string";
  RegisterType2["BOOL"] = "bool";
  RegisterType2["BINARY"] = "binary";
  RegisterType2["BCD"] = "bcd";
  return RegisterType2;
})(RegisterType || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MODBUS_EXCEPTION_MESSAGES,
  ModbusExceptionCode,
  ModbusFunctionCode,
  RegisterType
});
