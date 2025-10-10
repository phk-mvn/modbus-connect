"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_d_exports = {};
module.exports = __toCommonJS(index_d_exports);
__reExport(index_d_exports, require("./client.d.ts"), module.exports);
__reExport(index_d_exports, require("./polling-manager.d.ts"), module.exports);
__reExport(index_d_exports, require("./transport.d.ts"), module.exports);
__reExport(index_d_exports, require("./logger.d.ts"), module.exports);
__reExport(index_d_exports, require("./diagnostics.d.ts"), module.exports);
__reExport(index_d_exports, require("./errors.d.ts"), module.exports);
__reExport(index_d_exports, require("../transport/web-transports/web-serialport.d.ts"), module.exports);
__reExport(index_d_exports, require("../transport/node-transports/node-serialport.d.ts"), module.exports);
__reExport(index_d_exports, require("../slave-emulator/slave-emulator.d.ts"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ...require("./client.d.ts"),
  ...require("./polling-manager.d.ts"),
  ...require("./transport.d.ts"),
  ...require("./logger.d.ts"),
  ...require("./diagnostics.d.ts"),
  ...require("./errors.d.ts"),
  ...require("../transport/web-transports/web-serialport.d.ts"),
  ...require("../transport/node-transports/node-serialport.d.ts"),
  ...require("../slave-emulator/slave-emulator.d.ts")
});
