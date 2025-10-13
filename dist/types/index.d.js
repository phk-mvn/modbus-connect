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
__reExport(index_d_exports, require("./client.d.js"), module.exports);
__reExport(index_d_exports, require("./polling-manager.d.js"), module.exports);
__reExport(index_d_exports, require("../transport/transport.d.js"), module.exports);
__reExport(index_d_exports, require("./logger.d.js"), module.exports);
__reExport(index_d_exports, require("./diagnostics.d.js"), module.exports);
__reExport(index_d_exports, require("./errors.d.js"), module.exports);
__reExport(index_d_exports, require("../transport/web-transports/web-serialport.d.js"), module.exports);
__reExport(index_d_exports, require("../transport/node-transports/node-serialport.d.js"), module.exports);
__reExport(index_d_exports, require("../slave-emulator/slave-emulator.d.js"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ...require("./client.d.js"),
  ...require("./polling-manager.d.js"),
  ...require("../transport/transport.d.js"),
  ...require("./logger.d.js"),
  ...require("./diagnostics.d.js"),
  ...require("./errors.d.js"),
  ...require("../transport/web-transports/web-serialport.d.js"),
  ...require("../transport/node-transports/node-serialport.d.js"),
  ...require("../slave-emulator/slave-emulator.d.js")
});
