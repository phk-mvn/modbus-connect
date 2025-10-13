"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var factory_exports = {};
__export(factory_exports, {
  createTransport: () => createTransport
});
module.exports = __toCommonJS(factory_exports);
var import_logger = __toESM(require("../logger.js"));
const logger = new import_logger.default();
logger.setTransportType("factory");
async function createTransport(type, options = {}) {
  logger.setTransportType(type);
  try {
    switch (type) {
      case "node": {
        const path = options.port || options.path;
        if (!path) {
          throw new Error('Missing "port" (or "path") option for node transport');
        }
        const NodeSerialTransport = (await import("./node-transports/node-serialport.js")).default;
        const rest = { ...options };
        delete rest.port;
        delete rest.path;
        return new NodeSerialTransport(path, rest);
      }
      case "web": {
        const port = options.port;
        if (!port) {
          throw new Error('Missing "port" option for web transport');
        }
        const WebSerialTransport = (await import("./web-transports/web-serialport.js")).default;
        const portFactory = async () => {
          logger.debug("WebSerialTransport portFactory: Returning provided port instance");
          try {
            if (port.readable || port.writable) {
              logger.debug(
                "WebSerialTransport portFactory: Port seems to be in use, trying to close..."
              );
              try {
                await port.close();
                logger.debug("WebSerialTransport portFactory: Existing port closed");
              } catch (closeErr) {
                logger.warn(
                  "WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):",
                  closeErr.message
                );
              }
            }
          } catch (err) {
            logger.error(
              "WebSerialTransport portFactory: Failed to prepare existing port for reuse:",
              err
            );
          }
          return port;
        };
        const rest = { ...options };
        delete rest.port;
        logger.debug("Creating WebSerialTransport with provided port");
        return new WebSerialTransport(portFactory, rest);
      }
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  } catch (err) {
    logger.error(`Failed to create transport of type "${type}": ${err.message}`);
    throw err;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTransport
});
