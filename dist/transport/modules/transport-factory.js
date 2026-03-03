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
var transport_factory_exports = {};
__export(transport_factory_exports, {
  TransportFactory: () => TransportFactory
});
module.exports = __toCommonJS(transport_factory_exports);
class TransportFactory {
  /**
   * Создает экземпляр транспорта в зависимости от типа.
   * @param type Тип транспорта ('node' | 'web' | 'node-tcp' | 'web-tcp')
   * @param options Опции транспорта
   * @param logger Инстанс логгера для передачи в Web-транспорт (если нужно) или для логирования ошибок создания
   */
  static async create(type, options, logger) {
    try {
      switch (type) {
        case "node": {
          const path = options.port || options.path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }
          const NodeSerialTransport = (await import("../node-transports/node-serialport.js")).default;
          const nodeOptions = {};
          const allowedNodeKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "maxBufferSize",
            "reconnectInterval",
            "maxReconnectAttempts",
            "RSMode"
          ];
          for (const key of allowedNodeKeys) {
            if (key in options) {
              nodeOptions[key] = options[key];
            }
          }
          return new NodeSerialTransport(path, nodeOptions);
        }
        case "web": {
          const port = options.port;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }
          const WebSerialTransport = (await import("../web-transports/web-serialport.js")).default;
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
          const webOptions = {};
          const allowedWebKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "reconnectInterval",
            "maxReconnectAttempts",
            "maxEmptyReadsBeforeReconnect",
            "RSMode"
          ];
          for (const key of allowedWebKeys) {
            if (key in options) {
              webOptions[key] = options[key];
            }
          }
          logger.debug("Creating WebSerialTransport with provided port");
          return new WebSerialTransport(portFactory, webOptions);
        }
        case "node-tcp": {
          const { host, port } = options;
          if (!host || !port) {
            throw new Error('Missing "host" or "port" for node-tcp transport');
          }
          const NodeTcpTransport = (await import("../node-transports/node-tcp-transport.js")).default;
          return new NodeTcpTransport(host, port, options);
        }
        case "web-tcp": {
          const { url } = options;
          if (!url) {
            throw new Error('Missing "url" (WebSocket) for web-tcp transport');
          }
          const WebTcpTransport = (await import("../web-transports/web-tcp-transport.js")).default;
          return new WebTcpTransport(url, options);
        }
        default:
          throw new Error(`Unknown transport type: ${type}`);
      }
    } catch (err) {
      logger.error(`Failed to create transport of type "${type}": ${err.message}`);
      throw err;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TransportFactory
});
