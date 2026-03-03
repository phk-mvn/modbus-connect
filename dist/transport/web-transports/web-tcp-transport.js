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
var web_tcp_transport_exports = {};
__export(web_tcp_transport_exports, {
  default: () => web_tcp_transport_default
});
module.exports = __toCommonJS(web_tcp_transport_exports);
var import_async_mutex = require("async-mutex");
var import_utils = require("../../utils/utils.js");
var import_logger = __toESM(require("../../logger.js"));
var import_errors = require("../../errors.js");
const loggerInstance = new import_logger.default();
const logger = loggerInstance.createLogger("WebTcpTransport");
logger.setLevel("info");
class WebTcpTransport {
  isOpen = false;
  url;
  options;
  socket = null;
  readBuffer = (0, import_utils.allocUint8Array)(0);
  _reconnectAttempts = 0;
  _shouldReconnect = true;
  _reconnectTimeout = null;
  // Используем any для совместимости браузер/node
  _isConnecting = false;
  _isDisconnecting = false;
  _isFlushing = false;
  _operationMutex = new import_async_mutex.Mutex();
  _connectedSlaveIds = /* @__PURE__ */ new Set();
  _deviceStateHandler = null;
  _portStateHandler = null;
  _wasEverConnected = false;
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      readTimeout: options.readTimeout || 2e3,
      writeTimeout: options.writeTimeout || 2e3,
      maxBufferSize: options.maxBufferSize || 8192,
      reconnectInterval: options.reconnectInterval || 3e3,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity
    };
  }
  getRSMode() {
    return "RS485";
  }
  setDeviceStateHandler(handler) {
    this._deviceStateHandler = handler;
  }
  setPortStateHandler(handler) {
    this._portStateHandler = handler;
  }
  async disableDeviceTracking() {
    this._deviceStateHandler = null;
  }
  async enableDeviceTracking(handler) {
    if (handler) this._deviceStateHandler = handler;
  }
  notifyDeviceConnected(slaveId) {
    if (this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) this._deviceStateHandler(slaveId, true);
  }
  notifyDeviceDisconnected(slaveId, errorType, errorMessage) {
    if (!this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.delete(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, false, { type: errorType, message: errorMessage });
    }
  }
  async connect() {
    if (this._isConnecting || this.isOpen) return;
    this._isConnecting = true;
    this._shouldReconnect = true;
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to WebSocket Proxy: ${this.url}`);
      try {
        this.socket = new WebSocket(this.url);
        this.socket.binaryType = "arraybuffer";
        this.socket.onopen = () => {
          this.isOpen = true;
          this._isConnecting = false;
          this._reconnectAttempts = 0;
          this._wasEverConnected = true;
          logger.info(`WebSocket Connected: ${this.url}`);
          this._notifyPortState(true);
          resolve();
        };
        this.socket.onmessage = (event) => {
          this._onData(event.data);
        };
        this.socket.onerror = (err) => {
          logger.error("WebSocket Error", err);
          if (this._isConnecting) {
            this._isConnecting = false;
            reject(new Error("WebSocket connection failed"));
          }
        };
        this.socket.onclose = () => {
          this._onClose();
        };
      } catch (err) {
        this._isConnecting = false;
        reject(err);
      }
    });
  }
  _onData(data) {
    const chunk = new Uint8Array(data);
    if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
      this.readBuffer = (0, import_utils.allocUint8Array)(0);
      return;
    }
    this.readBuffer = (0, import_utils.concatUint8Arrays)([this.readBuffer, chunk]);
  }
  _onClose() {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen) {
      logger.warn(`WebSocket connection closed: ${this.url}`);
      this._notifyPortState(false);
    }
    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect();
    }
  }
  _scheduleReconnect() {
    if (this._reconnectTimeout || this._reconnectAttempts >= this.options.maxReconnectAttempts)
      return;
    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this.connect().catch(() => {
      });
    }, this.options.reconnectInterval);
  }
  _notifyPortState(connected) {
    if (this._wasEverConnected && this._portStateHandler) {
      this._portStateHandler(connected, Array.from(this._connectedSlaveIds));
    }
  }
  async write(buffer) {
    if (!this.isOpen || !this.socket) throw new Error("WebSocket not open");
    const release = await this._operationMutex.acquire();
    try {
      this.socket.send(buffer);
    } catch (err) {
      throw err;
    } finally {
      release();
    }
  }
  async read(length, timeout = this.options.readTimeout) {
    const start = Date.now();
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) return reject(new import_errors.ModbusFlushError());
          if (this.readBuffer.length >= length) {
            const data = (0, import_utils.sliceUint8Array)(this.readBuffer, 0, length);
            this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, length);
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            return reject(new import_errors.ModbusTimeoutError());
          }
          setTimeout(check, 10);
        };
        check();
      });
    } finally {
      release();
    }
  }
  async disconnect() {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isOpen = false;
    this._isDisconnecting = false;
  }
  async flush() {
    this._isFlushing = true;
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
    this._isFlushing = false;
  }
}
var web_tcp_transport_default = WebTcpTransport;
