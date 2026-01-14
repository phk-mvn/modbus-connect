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
var modbus_types_exports = {};
__export(modbus_types_exports, {
  ConnectionErrorType: () => ConnectionErrorType,
  ModbusFraming: () => ModbusFraming
});
module.exports = __toCommonJS(modbus_types_exports);
var ModbusFraming = /* @__PURE__ */ ((ModbusFraming2) => {
  ModbusFraming2["RTU"] = "RTU";
  ModbusFraming2["TCP"] = "TCP";
  return ModbusFraming2;
})(ModbusFraming || {});
var ConnectionErrorType = /* @__PURE__ */ ((ConnectionErrorType2) => {
  ConnectionErrorType2["UnknownError"] = "UnknownError";
  ConnectionErrorType2["PortClosed"] = "PortClosed";
  ConnectionErrorType2["Timeout"] = "Timeout";
  ConnectionErrorType2["CRCError"] = "CRCError";
  ConnectionErrorType2["ConnectionLost"] = "ConnectionLost";
  ConnectionErrorType2["DeviceOffline"] = "DeviceOffline";
  ConnectionErrorType2["MaxReconnect"] = "MaxReconnect";
  ConnectionErrorType2["ManualDisconnect"] = "ManualDisconnect";
  ConnectionErrorType2["Destroyed"] = "Destroyed";
  return ConnectionErrorType2;
})(ConnectionErrorType || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConnectionErrorType,
  ModbusFraming
});
