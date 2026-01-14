"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var net = __toESM(require("net"));
var import_async_mutex = require("async-mutex");
var import_utils = require("../../utils/utils.js");
var import_logger = __toESM(require("../../logger.js"));
var import_errors = require("../../errors.js");
var import_modbus_types = require("../../types/modbus-types.js");
const loggerInstance = new import_logger.default();
const logger = loggerInstance.createLogger("NodeTcpTransport");
logger.setLevel("info");
class NodeTcpTransport {
  isOpen = false;
  host;
  port;
  options;
  socket = null;
  readBuffer = (0, import_utils.allocUint8Array)(0);
  _reconnectAttempts = 0;
  _shouldReconnect = true;
  _reconnectTimeout = null;
  _isConnecting = false;
  _isDisconnecting = false;
  _isFlushing = false;
  _operationMutex = new import_async_mutex.Mutex();
  _connectedSlaveIds = /* @__PURE__ */ new Set();
  _deviceStateHandler = null;
  _portStateHandler = null;
  _wasEverConnected = false;
  constructor(host, port, options = {}) {
    this.host = host;
    this.port = port;
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
  setDeviceStateHandler(h) {
    this._deviceStateHandler = h;
  }
  setPortStateHandler(h) {
    this._portStateHandler = h;
  }
  async disableDeviceTracking() {
    this._deviceStateHandler = null;
  }
  async enableDeviceTracking(h) {
    if (h) this._deviceStateHandler = h;
  }
  notifyDeviceConnected(id) {
    if (this._connectedSlaveIds.has(id)) return;
    this._connectedSlaveIds.add(id);
    this._deviceStateHandler?.(id, true);
  }
  notifyDeviceDisconnected(id, type, msg) {
    if (!this._connectedSlaveIds.has(id)) return;
    this._connectedSlaveIds.delete(id);
    this._deviceStateHandler?.(id, false, { type, message: msg });
  }
  async connect() {
    if (this._isConnecting || this.isOpen) return;
    this._isConnecting = true;
    this._shouldReconnect = true;
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to ${this.host}:${this.port}...`);
      this.socket = net.connect({ host: this.host, port: this.port }, () => {
        this.isOpen = true;
        this._isConnecting = false;
        this._reconnectAttempts = 0;
        this._wasEverConnected = true;
        this.socket?.setNoDelay(true);
        logger.info(`SUCCESS: Connected to ${this.host}:${this.port}`);
        this._notifyPortState(true);
        resolve();
      });
      this.socket.on("data", (data) => {
        const buffer = typeof data === "string" ? Buffer.from(data, "hex") : data;
        console.log(
          `\x1B[32m>>> RAW DATA RECEIVED (${buffer.length} bytes): ${buffer.toString("hex")}\x1B[0m`
        );
        this._onData(buffer);
      });
      this.socket.on("error", (err) => {
        if (this._isConnecting) {
          this._isConnecting = false;
          reject(err);
        }
        this._onError(err);
      });
      this.socket.on("close", () => this._onClose());
      this.socket.setTimeout(this.options.readTimeout);
      this.socket.on("timeout", () => {
        if (this._isConnecting) {
          this.socket?.destroy();
          reject(new import_errors.ModbusTimeoutError("TCP Connection timeout"));
        }
      });
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
  _onError(err) {
    logger.error(`Socket error: ${err.message}`);
    this._handleConnectionLoss(err.message);
  }
  _onClose() {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen) {
      logger.warn(`Connection closed for ${this.host}:${this.port}`);
      this._notifyPortState(false);
    }
    if (this._shouldReconnect && !this._isDisconnecting) this._scheduleReconnect();
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
  _handleConnectionLoss(reason) {
    this._deviceStateHandler?.(0, false, {
      type: import_modbus_types.ConnectionErrorType.ConnectionLost,
      message: reason
    });
    this._connectedSlaveIds.clear();
  }
  async write(buffer) {
    if (!this.isOpen || !this.socket) throw new Error("Transport not open");
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        console.log(`\x1B[33m<<< RAW DATA SEND: ${Buffer.from(buffer).toString("hex")}\x1B[0m`);
        this.socket.write(Buffer.from(buffer), (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
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
          if (Date.now() - start > timeout) return reject(new import_errors.ModbusTimeoutError());
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
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.end(() => {
          this.isOpen = false;
          this.socket = null;
          resolve();
        });
      } else resolve();
    });
  }
  async flush() {
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
  }
}
module.exports = NodeTcpTransport;
