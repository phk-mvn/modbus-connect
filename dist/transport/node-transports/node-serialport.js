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
var import_serialport = require("serialport");
var import_async_mutex = require("async-mutex");
var import_utils = require("../../utils/utils.js");
var import_logger = __toESM(require("../../logger.js"));
var import_errors = require("../../errors.js");
var import_modbus_types = require("../../types/modbus-types.js");
const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 10
};
const loggerInstance = new import_logger.default();
loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
loggerInstance.setCustomFormatter("logger", (value) => {
  return typeof value === "string" ? `[${value}]` : "";
});
const logger = loggerInstance.createLogger("NodeSerialTransport");
logger.setLevel("info");
const ERROR_HANDLERS = {
  [import_errors.ModbusTimeoutError.name]: () => logger.error("Timeout error detected"),
  [import_errors.ModbusCRCError.name]: () => logger.error("CRC error detected"),
  [import_errors.ModbusParityError.name]: () => logger.error("Parity error detected"),
  [import_errors.ModbusNoiseError.name]: () => logger.error("Noise error detected"),
  [import_errors.ModbusFramingError.name]: () => logger.error("Framing error detected"),
  [import_errors.ModbusOverrunError.name]: () => logger.error("Overrun error detected"),
  [import_errors.ModbusCollisionError.name]: () => logger.error("Collision error detected"),
  [import_errors.ModbusConfigError.name]: () => logger.error("Configuration error detected"),
  [import_errors.ModbusBaudRateError.name]: () => logger.error("Baud rate error detected"),
  [import_errors.ModbusSyncError.name]: () => logger.error("Sync error detected"),
  [import_errors.ModbusFrameBoundaryError.name]: () => logger.error("Frame boundary error detected"),
  [import_errors.ModbusLRCError.name]: () => logger.error("LRC error detected"),
  [import_errors.ModbusChecksumError.name]: () => logger.error("Checksum error detected"),
  [import_errors.ModbusDataConversionError.name]: () => logger.error("Data conversion error detected"),
  [import_errors.ModbusBufferOverflowError.name]: () => logger.error("Buffer overflow error detected"),
  [import_errors.ModbusBufferUnderrunError.name]: () => logger.error("Buffer underrun error detected"),
  [import_errors.ModbusMemoryError.name]: () => logger.error("Memory error detected"),
  [import_errors.ModbusStackOverflowError.name]: () => logger.error("Stack overflow error detected"),
  [import_errors.ModbusResponseError.name]: () => logger.error("Response error detected"),
  [import_errors.ModbusInvalidAddressError.name]: () => logger.error("Invalid address error detected"),
  [import_errors.ModbusInvalidFunctionCodeError.name]: () => logger.error("Invalid function code error detected"),
  [import_errors.ModbusInvalidQuantityError.name]: () => logger.error("Invalid quantity error detected"),
  [import_errors.ModbusIllegalDataAddressError.name]: () => logger.error("Illegal data address error detected"),
  [import_errors.ModbusIllegalDataValueError.name]: () => logger.error("Illegal data value error detected"),
  [import_errors.ModbusSlaveBusyError.name]: () => logger.error("Slave busy error detected"),
  [import_errors.ModbusAcknowledgeError.name]: () => logger.error("Acknowledge error detected"),
  [import_errors.ModbusSlaveDeviceFailureError.name]: () => logger.error("Slave device failure error detected"),
  [import_errors.ModbusMalformedFrameError.name]: () => logger.error("Malformed frame error detected"),
  [import_errors.ModbusInvalidFrameLengthError.name]: () => logger.error("Invalid frame length error detected"),
  [import_errors.ModbusInvalidTransactionIdError.name]: () => logger.error("Invalid transaction ID error detected"),
  [import_errors.ModbusUnexpectedFunctionCodeError.name]: () => logger.error("Unexpected function code error detected"),
  [import_errors.ModbusConnectionRefusedError.name]: () => logger.error("Connection refused error detected"),
  [import_errors.ModbusConnectionTimeoutError.name]: () => logger.error("Connection timeout error detected"),
  [import_errors.ModbusNotConnectedError.name]: () => logger.error("Not connected error detected"),
  [import_errors.ModbusAlreadyConnectedError.name]: () => logger.error("Already connected error detected"),
  [import_errors.ModbusInsufficientDataError.name]: () => logger.error("Insufficient data error detected"),
  [import_errors.ModbusGatewayPathUnavailableError.name]: () => logger.error("Gateway path unavailable error detected"),
  [import_errors.ModbusGatewayTargetDeviceError.name]: () => logger.error("Gateway target device error detected"),
  [import_errors.ModbusInvalidStartingAddressError.name]: () => logger.error("Invalid starting address error detected"),
  [import_errors.ModbusMemoryParityError.name]: () => logger.error("Memory parity error detected"),
  [import_errors.ModbusBroadcastError.name]: () => logger.error("Broadcast error detected"),
  [import_errors.ModbusGatewayBusyError.name]: () => logger.error("Gateway busy error detected"),
  [import_errors.ModbusDataOverrunError.name]: () => logger.error("Data overrun error detected"),
  [import_errors.ModbusInterFrameTimeoutError.name]: () => logger.error("Inter-frame timeout error detected"),
  [import_errors.ModbusSilentIntervalError.name]: () => logger.error("Silent interval error detected"),
  [import_errors.ModbusTooManyEmptyReadsError.name]: () => logger.error("Too many empty reads error detected"),
  [import_errors.ModbusFlushError.name]: () => logger.error("Flush error detected"),
  [import_errors.NodeSerialTransportError.name]: () => logger.error("NodeSerial transport error detected"),
  [import_errors.NodeSerialConnectionError.name]: () => logger.error("NodeSerial connection error detected"),
  [import_errors.NodeSerialReadError.name]: () => logger.error("NodeSerial read error detected"),
  [import_errors.NodeSerialWriteError.name]: () => logger.error("NodeSerial write error detected")
};
const handleModbusError = (err) => {
  const handler = ERROR_HANDLERS[err.constructor.name];
  if (handler) {
    handler();
  } else {
    logger.error(`Unknown error: ${err.message}`);
  }
};
class NodeSerialTransport {
  isOpen = false;
  path;
  options;
  port = null;
  readBuffer = (0, import_utils.allocUint8Array)(0);
  _reconnectAttempts = 0;
  _shouldReconnect = true;
  _reconnectTimeout = null;
  _isConnecting = false;
  _isDisconnecting = false;
  _isFlushing = false;
  _pendingFlushPromises = [];
  _operationMutex = new import_async_mutex.Mutex();
  _connectionPromise = null;
  _resolveConnection = null;
  _rejectConnection = null;
  _connectedSlaveIds = /* @__PURE__ */ new Set();
  _deviceStateHandler = null;
  _portStateHandler = null;
  _wasEverConnected = false;
  constructor(port, options = {}) {
    this.path = port;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      readTimeout: 1e3,
      writeTimeout: 1e3,
      maxBufferSize: NODE_SERIAL_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
      reconnectInterval: 3e3,
      maxReconnectAttempts: Infinity,
      ...options
    };
  }
  setDeviceStateHandler(handler) {
    this._deviceStateHandler = handler;
  }
  setPortStateHandler(handler) {
    this._portStateHandler = handler;
  }
  async disableDeviceTracking() {
    this._deviceStateHandler = null;
    logger.debug("Device tracking disabled");
  }
  async enableDeviceTracking(handler) {
    if (handler) {
      this._deviceStateHandler = handler;
    }
    logger.debug("Device tracking enabled");
  }
  notifyDeviceConnected(slaveId) {
    if (this._connectedSlaveIds.has(slaveId)) {
      return;
    }
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, true);
    }
  }
  notifyDeviceDisconnected(slaveId, errorType, errorMessage) {
    if (!this._connectedSlaveIds.has(slaveId)) {
      return;
    }
    this._connectedSlaveIds.delete(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, false, { type: errorType, message: errorMessage });
    }
  }
  async _notifyPortConnected() {
    this._wasEverConnected = true;
    if (this._portStateHandler) {
      this._portStateHandler(true, [], void 0);
    }
  }
  async _notifyPortDisconnected(errorType = import_modbus_types.ConnectionErrorType.UnknownError, errorMessage = "Port disconnected") {
    if (!this._wasEverConnected) {
      logger.debug("Skipping DISCONNECTED \u2014 port was never connected");
      return;
    }
    if (this._portStateHandler) {
      this._portStateHandler(false, [], { type: errorType, message: errorMessage });
    }
  }
  async _releaseAllResources() {
    logger.debug("Releasing NodeSerial resources");
    this._removeAllListeners();
    if (this.port && this.port.isOpen) {
      await new Promise((resolve, reject) => {
        this.port.close((_err) => {
          if (_err) reject(_err);
          else {
            logger.debug("Port closed successfully");
            resolve();
          }
        });
      });
    }
    this.port = null;
    this.isOpen = false;
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
    this._connectedSlaveIds.clear();
  }
  _removeAllListeners() {
    if (this.port) {
      this.port.removeAllListeners("data");
      this.port.removeAllListeners("error");
      this.port.removeAllListeners("close");
    }
  }
  async connect() {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new import_errors.NodeSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      logger.error(`Connection failed: ${error.message}`);
      throw error;
    }
    if (this._isConnecting) {
      logger.warn(`Connection attempt already in progress`);
      return this._connectionPromise ?? Promise.resolve();
    }
    this._isConnecting = true;
    this._connectionPromise = new Promise((resolve, reject) => {
      this._resolveConnection = resolve;
      this._rejectConnection = reject;
    });
    try {
      if (this._reconnectTimeout) {
        clearTimeout(this._reconnectTimeout);
        this._reconnectTimeout = null;
      }
      if (this.port) {
        await this._releaseAllResources();
      }
      if (this.options.baudRate < NODE_SERIAL_CONSTANTS.MIN_BAUD_RATE || this.options.baudRate > NODE_SERIAL_CONSTANTS.MAX_BAUD_RATE) {
        throw new import_errors.ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }
      await this._createAndOpenPort();
      logger.info(`Serial port ${this.path} opened`);
      await this._notifyPortConnected();
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
      logger.error(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;
      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(import_modbus_types.ConnectionErrorType.ConnectionLost, error.message);
      }
      if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
        const maxError = new import_errors.NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        if (this._rejectConnection) {
          this._rejectConnection(maxError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw maxError;
      }
      if (this._shouldReconnect) {
        this._scheduleReconnect(error);
      } else {
        if (this._rejectConnection) {
          this._rejectConnection(error);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw error;
      }
    } finally {
      this._isConnecting = false;
    }
  }
  async _createAndOpenPort() {
    return new Promise((resolve, reject) => {
      const serialOptions = {
        path: this.path,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false
      };
      this.port = new import_serialport.SerialPort(serialOptions);
      this.port.open((_err) => {
        if (_err) {
          this.isOpen = false;
          if (_err.message.includes("permission")) {
            reject(new import_errors.NodeSerialConnectionError("Permission denied"));
          } else if (_err.message.includes("busy")) {
            reject(new import_errors.NodeSerialConnectionError("Serial port is busy"));
          } else if (_err.message.includes("no such file")) {
            reject(new import_errors.NodeSerialConnectionError("Serial port does not exist"));
          } else {
            reject(new import_errors.NodeSerialConnectionError(_err.message));
          }
          return;
        }
        this.isOpen = true;
        this._reconnectAttempts = 0;
        this._removeAllListeners();
        this.port?.on("data", this._onData.bind(this));
        this.port?.on("error", this._onError.bind(this));
        this.port?.on("close", this._onClose.bind(this));
        resolve();
      });
    });
  }
  _onData(data) {
    if (!this.isOpen) return;
    try {
      const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
        this._handleError(
          new import_errors.ModbusBufferOverflowError(
            this.readBuffer.length + chunk.length,
            this.options.maxBufferSize
          )
        );
        return;
      }
      this.readBuffer = (0, import_utils.concatUint8Arrays)([this.readBuffer, chunk]);
      if (this.readBuffer.length > this.options.maxBufferSize) {
        this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, -this.options.maxBufferSize);
      }
    } catch (err) {
      this._handleError(err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err)));
    }
  }
  _onError(err) {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    if (err.message.includes("parity")) this._handleError(new import_errors.ModbusParityError(err.message));
    else if (err.message.includes("frame")) this._handleError(new import_errors.ModbusFramingError(err.message));
    else if (err.message.includes("overrun"))
      this._handleError(new import_errors.ModbusOverrunError(err.message));
    else if (err.message.includes("collision"))
      this._handleError(new import_errors.ModbusCollisionError(err.message));
    else if (err.message.includes("noise")) this._handleError(new import_errors.ModbusNoiseError(err.message));
    else this._handleError(new import_errors.NodeSerialTransportError(err.message));
  }
  _onClose() {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._notifyPortDisconnected(import_modbus_types.ConnectionErrorType.PortClosed, "Port was closed").catch(() => {
    });
  }
  _scheduleReconnect(_err) {
    if (!this._shouldReconnect || this._isDisconnecting) return;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      const maxError = new import_errors.NodeSerialConnectionError(`Max reconnect attempts reached`);
      if (this._rejectConnection) this._rejectConnection(maxError);
      this._shouldReconnect = false;
      return;
    }
    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }
  async _attemptReconnect() {
    try {
      if (this.port && this.port.isOpen) await this._releaseAllResources();
      await this._createAndOpenPort();
      this._reconnectAttempts = 0;
      await this._notifyPortConnected();
      if (this._resolveConnection) this._resolveConnection();
    } catch (error) {
      const err = error instanceof Error ? error : new import_errors.NodeSerialTransportError(String(error));
      this._reconnectAttempts++;
      if (this._shouldReconnect && !this._isDisconnecting && this._reconnectAttempts <= this.options.maxReconnectAttempts) {
        this._scheduleReconnect(err);
      } else {
        const maxError = new import_errors.NodeSerialConnectionError(`Max reconnect attempts reached`);
        if (this._rejectConnection) this._rejectConnection(maxError);
        this._shouldReconnect = false;
        await this._notifyPortDisconnected(import_modbus_types.ConnectionErrorType.MaxReconnect, maxError.message);
      }
    }
  }
  async flush() {
    if (this._isFlushing) {
      await Promise.all(this._pendingFlushPromises.map((p2) => p2())).catch(() => {
      });
      return;
    }
    this._isFlushing = true;
    const p = new Promise((resolve) => this._pendingFlushPromises.push(resolve));
    try {
      this.readBuffer = (0, import_utils.allocUint8Array)(0);
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach((r) => r());
      this._pendingFlushPromises = [];
    }
    return p;
  }
  async write(buffer) {
    if (!this.isOpen || !this.port?.isOpen) throw new import_errors.NodeSerialWriteError("Port closed");
    if (buffer.length === 0) throw new import_errors.ModbusBufferUnderrunError(0, 1);
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        this.port.write(buffer, "binary", (_err) => {
          if (_err) {
            const e = _err.message.includes("parity") ? new import_errors.ModbusParityError(_err.message) : _err.message.includes("collision") ? new import_errors.ModbusCollisionError(_err.message) : new import_errors.NodeSerialWriteError(_err.message);
            this._handleError(e);
            return reject(e);
          }
          this.port.drain((_drainErr) => {
            if (_drainErr) {
              const e = new import_errors.NodeSerialWriteError(_drainErr.message);
              this._handleError(e);
              return reject(e);
            }
            resolve();
          });
        });
      });
    } finally {
      release();
    }
  }
  async read(length, timeout = this.options.readTimeout) {
    if (length <= 0) throw new import_errors.ModbusDataConversionError(length, "positive");
    const release = await this._operationMutex.acquire();
    const start = Date.now();
    try {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (!this.isOpen || !this.port?.isOpen) {
            return reject(new import_errors.NodeSerialReadError("Port is closed"));
          }
          if (this._isFlushing) {
            return reject(new import_errors.ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = (0, import_utils.sliceUint8Array)(this.readBuffer, 0, length);
            this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, length);
            if (data.length !== length) {
              return reject(new import_errors.ModbusInsufficientDataError(data.length, length));
            }
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            return reject(
              new import_errors.ModbusTimeoutError(`Read timeout: No data received within ${timeout}ms`)
            );
          }
          setTimeout(check, NODE_SERIAL_CONSTANTS.POLL_INTERVAL_MS);
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
    if (this._rejectConnection)
      this._rejectConnection(new import_errors.NodeSerialConnectionError("Disconnected"));
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          import_modbus_types.ConnectionErrorType.ManualDisconnect,
          "Port closed by user"
        );
      }
      return;
    }
    await this._releaseAllResources();
    if (this._wasEverConnected) {
      await this._notifyPortDisconnected(
        import_modbus_types.ConnectionErrorType.ManualDisconnect,
        "Port closed by user"
      );
    }
    this._isDisconnecting = false;
  }
  destroy() {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection) this._rejectConnection(new import_errors.NodeSerialTransportError("Destroyed"));
    this._releaseAllResources().catch(() => {
    });
    if (this._wasEverConnected) {
      this._notifyPortDisconnected(import_modbus_types.ConnectionErrorType.Destroyed, "Transport destroyed").catch(
        () => {
        }
      );
    }
  }
  _handleError(err) {
    handleModbusError(err);
    this._handleConnectionLoss(`Error: ${err.message}`);
  }
  _handleConnectionLoss(reason) {
    if (!this.isOpen && !this._isConnecting) return;
    logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;
    if (this._wasEverConnected) {
      this._notifyPortDisconnected(import_modbus_types.ConnectionErrorType.ConnectionLost, reason).catch(() => {
      });
    }
  }
}
module.exports = NodeSerialTransport;
