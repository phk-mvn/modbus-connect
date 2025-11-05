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
var logger_d_exports = {};
__export(logger_d_exports, {
  Logger: () => Logger,
  LoggerInstance: () => import_modbus_types.LoggerInstance
});
module.exports = __toCommonJS(logger_d_exports);
var import_modbus_types = require("./modbus-types.js");
class Logger {
}
logger_d_module.exports = Logger;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Logger,
  LoggerInstance
});
