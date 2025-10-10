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
var diagnostics_d_exports = {};
__export(diagnostics_d_exports, {
  AnalysisResult: () => import_modbus_types.AnalysisResult,
  Diagnostics: () => Diagnostics,
  DiagnosticsInterface: () => import_modbus_types.DiagnosticsInterface,
  DiagnosticsOptions: () => import_modbus_types.DiagnosticsOptions,
  DiagnosticsStats: () => import_modbus_types.DiagnosticsStats
});
module.exports = __toCommonJS(diagnostics_d_exports);
var import_modbus_types = require("./modbus-types");
class Diagnostics {
  averageResponseTime;
  averageResponseTimeAll;
  errorRate;
  requestsPerSecond;
  uptimeSeconds;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnalysisResult,
  Diagnostics,
  DiagnosticsInterface,
  DiagnosticsOptions,
  DiagnosticsStats
});
