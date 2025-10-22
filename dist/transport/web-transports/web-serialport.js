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
var import_logger = __toESM(require("../../logger.js"));
var import_utils = require("../../utils/utils.js");
var import_async_mutex = require("async-mutex");
var import_errors = require("../../errors.js");
const loggerInstance = new import_logger.default();
loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
loggerInstance.setCustomFormatter("logger", (value) => {
  return value ? `[${value}]` : "";
});
const logger = loggerInstance.createLogger("WebSerialTransport");
logger.setLevel("info");
class WebSerialTransport {
  portFactory;
  port = null;
  options;
  reader = null;
  writer = null;
  readBuffer;
  isOpen = false;
  _reconnectAttempts = 0;
  _shouldReconnect = true;
  _isConnecting = false;
  _isDisconnecting = false;
  _isFlushing = false;
  _pendingFlushPromises = [];
  _reconnectTimer = null;
  _emptyReadCount = 0;
  _readLoopActive = false;
  _readLoopAbortController = null;
  _operationMutex;
  _connectionPromise = null;
  _resolveConnection = null;
  _rejectConnection = null;
  // Слушатели состояния связи с устройством
  _deviceConnectionListeners = [];
  // Карта состояний для каждого slaveId
  _deviceStates = /* @__PURE__ */ new Map();
  constructor(portFactory, options = {}) {
    if (typeof portFactory !== "function") {
      throw new import_errors.WebSerialTransportError(
        "A port factory function must be provided to WebSerialTransport"
      );
    }
    this.portFactory = portFactory;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      readTimeout: 1e3,
      writeTimeout: 1e3,
      reconnectInterval: 3e3,
      maxReconnectAttempts: Infinity,
      maxEmptyReadsBeforeReconnect: 10,
      ...options
    };
    this.readBuffer = new Uint8Array(0);
    this._operationMutex = new import_async_mutex.Mutex();
  }
  // Публичный метод для добавления слушателя состояния связи с устройством
  addDeviceConnectionListener(listener) {
    this._deviceConnectionListeners.push(listener);
    for (const state of this._deviceStates.values()) {
      listener(state);
    }
  }
  // Публичный метод для удаления слушателя состояния связи с устройством
  removeDeviceConnectionListener(listener) {
    const index = this._deviceConnectionListeners.indexOf(listener);
    if (index !== -1) {
      this._deviceConnectionListeners.splice(index, 1);
    }
  }
  // Приватный метод для уведомления слушателей о смене состояния конкретного slaveId
  _notifyDeviceConnectionListeners(slaveId, state) {
    this._deviceStates.set(slaveId, state);
    logger.debug(`Device connection state changed for slaveId ${slaveId}:`, state);
    const listeners = [...this._deviceConnectionListeners];
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (err) {
        logger.error(
          `Error in device connection listener for slaveId ${slaveId}: ${err.message}`
        );
      }
    }
  }
  // Приватный метод для создания объекта состояния подключения
  _createState(slaveId, hasConnection, errorType, errorMessage) {
    if (hasConnection) {
      return {
        slaveId,
        hasConnectionDevice: true,
        errorType: void 0,
        errorMessage: void 0
      };
    } else {
      return {
        slaveId,
        hasConnectionDevice: false,
        errorType,
        errorMessage
      };
    }
  }
  // Метод для установки состояния устройства как подключенного
  // Вызывается из ModbusClient при успешном обмене
  notifyDeviceConnected(slaveId) {
    const currentState = this._deviceStates.get(slaveId);
    if (!currentState || !currentState.hasConnectionDevice) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, true));
    }
  }
  // Метод для установки состояния устройства как отключенного
  // Вызывается из ModbusClient при ошибке обмена
  notifyDeviceDisconnected(slaveId, errorType, errorMessage) {
    this._notifyDeviceConnectionListeners(
      slaveId,
      this._createState(slaveId, false, errorType, errorMessage)
    );
  }
  async connect() {
    if (this._isConnecting) {
      logger.warn("Connection attempt already in progress, waiting for it to complete");
      if (this._connectionPromise) {
        return this._connectionPromise;
      }
      return Promise.resolve();
    }
    this._isConnecting = true;
    this._connectionPromise = new Promise((resolve, reject) => {
      this._resolveConnection = resolve;
      this._rejectConnection = reject;
    });
    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      this._shouldReconnect = true;
      this._emptyReadCount = 0;
      logger.debug("Requesting new SerialPort instance from factory...");
      if (this.port && this.isOpen) {
        logger.warn("Closing existing port before reconnecting");
        await this._forceCloseCurrentPort();
      }
      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== "function") {
        throw new import_errors.WebSerialConnectionError(
          "Port factory did not return a valid SerialPort object."
        );
      }
      logger.debug("New SerialPort instance acquired.");
      this._cleanupResources();
      if (this.options.baudRate < 300 || this.options.baudRate > 115200) {
        throw new import_errors.ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }
      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: "none"
      });
      const readable = this.port.readable;
      const writable = this.port.writable;
      if (!readable || !writable) {
        const errorMsg = "Serial port not readable/writable after open";
        logger.error(errorMsg);
        await this._forceCloseCurrentPort();
        throw new import_errors.WebSerialConnectionError(errorMsg);
      }
      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;
      this._startReading();
      logger.info("WebSerial port opened successfully with new instance");
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      return this._connectionPromise;
    } catch (err) {
      logger.error(`Failed to open WebSerial port: ${err.message}`);
      this.isOpen = false;
      if (err instanceof import_errors.ModbusConfigError) {
        logger.error("Configuration error during connection");
      } else if (err instanceof import_errors.WebSerialConnectionError) {
        logger.error("Connection error during port opening");
      }
      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        logger.info("Auto-reconnect enabled, starting reconnect process...");
        this._scheduleReconnect(err);
        return this._connectionPromise;
      } else {
        if (this._rejectConnection) {
          this._rejectConnection(err);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw err;
      }
    } finally {
      this._isConnecting = false;
    }
  }
  async _forceCloseCurrentPort() {
    if (!this.port) return;
    logger.debug("Force closing current port...");
    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (err) {
        logger.debug("Error cancelling reader:", err.message);
      }
      this.reader = null;
    }
    if (this.writer) {
      try {
        this.writer.releaseLock();
        await this.writer.close().catch(() => {
        });
      } catch (err) {
        logger.debug("Error releasing writer:", err.message);
      }
      this.writer = null;
    }
    if (this.port && this.port.opened) {
      try {
        await this.port.close();
        logger.debug("Port closed successfully");
      } catch (err) {
        logger.warn(`Error closing port: ${err.message}`);
      }
    }
    this.port = null;
    this.isOpen = false;
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
  }
  _cleanupResources() {
    logger.debug("Cleaning up WebSerial resources");
    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }
    if (this.reader) {
      try {
        this.reader.cancel();
        this.reader.releaseLock();
      } catch (e) {
        logger.debug("Error releasing reader:", e.message);
      }
      this.reader = null;
    }
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {
        logger.debug("Error releasing writer:", e.message);
      }
      this.writer = null;
    }
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
    this._readLoopActive = false;
    this._emptyReadCount = 0;
  }
  _startReading() {
    if (!this.isOpen || !this.reader || this._readLoopActive) {
      logger.warn("Cannot start reading: port not open, no reader, or loop already active");
      return;
    }
    this._readLoopActive = true;
    this._readLoopAbortController = new AbortController();
    logger.debug("Starting read loop");
    const loop = async () => {
      try {
        while (this.isOpen && this.reader && this._readLoopAbortController && !this._readLoopAbortController.signal.aborted) {
          try {
            const { value, done } = await this.reader.read();
            if (done || this._readLoopAbortController.signal.aborted) {
              logger.warn("WebSerial read stream closed (done=" + done + ")");
              this._readLoopActive = false;
              this._onClose();
              break;
            }
            if (value && value.length > 0) {
              this._emptyReadCount = 0;
              if (this.readBuffer.length + value.length > 65536) {
                logger.error("Buffer overflow detected");
                throw new import_errors.ModbusBufferOverflowError(this.readBuffer.length + value.length, 65536);
              }
              const newBuffer = new Uint8Array(this.readBuffer.length + value.length);
              newBuffer.set(this.readBuffer, 0);
              newBuffer.set(value, this.readBuffer.length);
              this.readBuffer = newBuffer;
            } else {
              this._emptyReadCount++;
              if (this._emptyReadCount >= this.options.maxEmptyReadsBeforeReconnect) {
                logger.warn(`Too many empty reads (${this._emptyReadCount}), triggering reconnect`);
                this._emptyReadCount = 0;
                this._readLoopActive = false;
                this._onError(new import_errors.ModbusTooManyEmptyReadsError());
                break;
              }
            }
          } catch (readErr) {
            if (this._readLoopAbortController.signal.aborted) {
              logger.debug("Read loop aborted");
              break;
            }
            const error = readErr;
            logger.warn(`Read operation error: ${error.message}`);
            if (error.message.includes("parity") || error.message.includes("Parity")) {
              this._onError(new import_errors.ModbusParityError(error.message));
            } else if (error.message.includes("frame") || error.message.includes("Framing")) {
              this._onError(new import_errors.ModbusFramingError(error.message));
            } else if (error.message.includes("overrun")) {
              this._onError(new import_errors.ModbusOverrunError(error.message));
            } else if (error.message.includes("collision")) {
              this._onError(new import_errors.ModbusCollisionError(error.message));
            } else if (error.message.includes("noise")) {
              this._onError(new import_errors.ModbusNoiseError(error.message));
            } else {
              this._onError(new import_errors.WebSerialReadError(error.message));
            }
            break;
          }
        }
      } catch (loopErr) {
        if (this._readLoopAbortController?.signal.aborted) {
          logger.debug("Read loop aborted externally");
        } else {
          logger.error(`Unexpected error in read loop: ${loopErr.message}`);
          this._readLoopActive = false;
          if (loopErr.message.includes("stack")) {
            this._onError(new import_errors.ModbusStackOverflowError(loopErr.message));
          } else {
            this._onError(loopErr);
          }
        }
      } finally {
        this._readLoopActive = false;
        logger.debug("Read loop finished");
      }
    };
    loop().catch((err) => {
      logger.error("Read loop promise rejected:", err);
      this._readLoopActive = false;
      if (err.message.includes("memory")) {
        this._onError(new import_errors.ModbusMemoryError(err.message));
      } else {
        this._onError(err);
      }
    });
  }
  async write(buffer) {
    if (this._isFlushing) {
      logger.debug("Write operation aborted due to ongoing flush");
      throw new import_errors.ModbusFlushError();
    }
    if (!this.isOpen || !this.writer) {
      logger.warn(`Write attempted on closed/unready port`);
      throw new import_errors.WebSerialWriteError("Port is closed or not ready for writing");
    }
    if (buffer.length === 0) {
      throw new import_errors.ModbusBufferUnderrunError(0, 1);
    }
    const release = await this._operationMutex.acquire();
    try {
      const timeout = this.options.writeTimeout;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);
      try {
        await this.writer.write(buffer);
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`);
      } catch (err) {
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`);
          const timeoutError = new import_errors.ModbusTimeoutError("Write timeout");
          this._onError(timeoutError);
          throw timeoutError;
        } else {
          logger.error(`Write error on WebSerial port: ${err.message}`);
          if (err.message.includes("parity")) {
            this._onError(new import_errors.ModbusParityError(err.message));
            throw new import_errors.ModbusParityError(err.message);
          } else if (err.message.includes("collision")) {
            this._onError(new import_errors.ModbusCollisionError(err.message));
            throw new import_errors.ModbusCollisionError(err.message);
          } else {
            this._onError(new import_errors.WebSerialWriteError(err.message));
            throw err;
          }
        }
      } finally {
        clearTimeout(timer);
        abort.abort();
      }
    } finally {
      release();
    }
  }
  async read(length, timeout = this.options.readTimeout) {
    if (!this.isOpen) {
      logger.warn("Read attempted on closed port");
      throw new import_errors.WebSerialReadError("Port is closed");
    }
    if (length <= 0) {
      throw new import_errors.ModbusDataConversionError(length, "positive integer");
    }
    const release = await this._operationMutex.acquire();
    try {
      const start = Date.now();
      return new Promise((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) {
            logger.debug("Read operation interrupted by flush");
            return reject(new import_errors.ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = this.readBuffer.slice(0, length);
            this.readBuffer = this.readBuffer.slice(length);
            logger.debug(`Read ${length} bytes from WebSerial port`);
            if (data.length !== length) {
              return reject(new import_errors.ModbusInsufficientDataError(data.length, length));
            }
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on WebSerial port`);
            return reject(new import_errors.ModbusTimeoutError("Read timeout"));
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
    logger.info("Disconnecting WebSerial transport...");
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      this._readLoopActive = false;
      this._cleanupResources();
      if (this.port) {
        try {
          logger.debug("Closing port...");
          await this.port.close();
          logger.debug("Port closed successfully.");
        } catch (err) {
          logger.warn(`Error closing port (might be already closed): ${err.message}`);
        }
        this.port = null;
      }
      if (this._rejectConnection) {
        this._rejectConnection(new import_errors.WebSerialConnectionError("Connection manually disconnected"));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this.isOpen = false;
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
      }
      this._deviceStates.clear();
      logger.info("WebSerial transport disconnected successfully");
    } catch (err) {
      logger.error(`Error during WebSerial transport shutdown: ${err.message}`);
    } finally {
      this._isDisconnecting = false;
      this.isOpen = false;
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }
  async flush() {
    logger.debug("Flushing WebSerial transport buffer");
    if (this._isFlushing) {
      logger.warn("Flush already in progress");
      await Promise.all(this._pendingFlushPromises).catch(() => {
      });
      return;
    }
    this._isFlushing = true;
    const flushPromise = new Promise((resolve) => {
      this._pendingFlushPromises.push(resolve);
    });
    try {
      this.readBuffer = (0, import_utils.allocUint8Array)(0);
      this._emptyReadCount = 0;
      logger.debug("WebSerial read buffer flushed");
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach((resolve) => resolve());
      this._pendingFlushPromises = [];
      logger.debug("WebSerial transport flush completed");
    }
    return flushPromise;
  }
  _handleConnectionLoss(reason) {
    if (!this.isOpen && !this._isConnecting) return;
    logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;
    this._readLoopActive = false;
    this._cleanupResources();
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
  }
  _onError(err) {
    logger.error(`WebSerial port error: ${err.message}`);
    let errorType = "unknown";
    let errorMessage = err.message;
    if (err instanceof import_errors.ModbusCRCError) {
      errorType = "ModbusCRCError";
      logger.error("CRC error detected");
    } else if (err instanceof import_errors.ModbusParityError) {
      errorType = "ModbusParityError";
      logger.error("Parity error detected");
    } else if (err instanceof import_errors.ModbusNoiseError) {
      errorType = "ModbusNoiseError";
      logger.error("Noise error detected");
    } else if (err instanceof import_errors.ModbusFramingError) {
      errorType = "ModbusFramingError";
      logger.error("Framing error detected");
    } else if (err instanceof import_errors.ModbusOverrunError) {
      errorType = "ModbusOverrunError";
      logger.error("Overrun error detected");
    } else if (err instanceof import_errors.ModbusCollisionError) {
      errorType = "ModbusCollisionError";
      logger.error("Collision error detected");
    } else if (err instanceof import_errors.ModbusConfigError) {
      errorType = "ModbusConfigError";
      logger.error("Configuration error detected");
    } else if (err instanceof import_errors.ModbusBaudRateError) {
      errorType = "ModbusBaudRateError";
      logger.error("Baud rate error detected");
    } else if (err instanceof import_errors.ModbusSyncError) {
      errorType = "ModbusSyncError";
      logger.error("Sync error detected");
    } else if (err instanceof import_errors.ModbusFrameBoundaryError) {
      errorType = "ModbusFrameBoundaryError";
      logger.error("Frame boundary error detected");
    } else if (err instanceof import_errors.ModbusLRCError) {
      errorType = "ModbusLRCError";
      logger.error("LRC error detected");
    } else if (err instanceof import_errors.ModbusChecksumError) {
      errorType = "ModbusChecksumError";
      logger.error("Checksum error detected");
    } else if (err instanceof import_errors.ModbusDataConversionError) {
      errorType = "ModbusDataConversionError";
      logger.error("Data conversion error detected");
    } else if (err instanceof import_errors.ModbusBufferOverflowError) {
      errorType = "ModbusBufferOverflowError";
      logger.error("Buffer overflow error detected");
    } else if (err instanceof import_errors.ModbusBufferUnderrunError) {
      errorType = "ModbusBufferUnderrunError";
      logger.error("Buffer underrun error detected");
    } else if (err instanceof import_errors.ModbusMemoryError) {
      errorType = "ModbusMemoryError";
      logger.error("Memory error detected");
    } else if (err instanceof import_errors.ModbusStackOverflowError) {
      errorType = "ModbusStackOverflowError";
      logger.error("Stack overflow error detected");
    } else if (err instanceof import_errors.ModbusResponseError) {
      errorType = "ModbusResponseError";
      logger.error("Response error detected");
    } else if (err instanceof import_errors.ModbusInvalidAddressError) {
      errorType = "ModbusInvalidAddressError";
      logger.error("Invalid address error detected");
    } else if (err instanceof import_errors.ModbusInvalidFunctionCodeError) {
      errorType = "ModbusInvalidFunctionCodeError";
      logger.error("Invalid function code error detected");
    } else if (err instanceof import_errors.ModbusInvalidQuantityError) {
      errorType = "ModbusInvalidQuantityError";
      logger.error("Invalid quantity error detected");
    } else if (err instanceof import_errors.ModbusIllegalDataAddressError) {
      errorType = "ModbusIllegalDataAddressError";
      logger.error("Illegal data address error detected");
    } else if (err instanceof import_errors.ModbusIllegalDataValueError) {
      errorType = "ModbusIllegalDataValueError";
      logger.error("Illegal data value error detected");
    } else if (err instanceof import_errors.ModbusSlaveBusyError) {
      errorType = "ModbusSlaveBusyError";
      logger.error("Slave busy error detected");
    } else if (err instanceof import_errors.ModbusAcknowledgeError) {
      errorType = "ModbusAcknowledgeError";
      logger.error("Acknowledge error detected");
    } else if (err instanceof import_errors.ModbusSlaveDeviceFailureError) {
      errorType = "ModbusSlaveDeviceFailureError";
      logger.error("Slave device failure error detected");
    } else if (err instanceof import_errors.ModbusMalformedFrameError) {
      errorType = "ModbusMalformedFrameError";
      logger.error("Malformed frame error detected");
    } else if (err instanceof import_errors.ModbusInvalidFrameLengthError) {
      errorType = "ModbusInvalidFrameLengthError";
      logger.error("Invalid frame length error detected");
    } else if (err instanceof import_errors.ModbusInvalidTransactionIdError) {
      errorType = "ModbusInvalidTransactionIdError";
      logger.error("Invalid transaction ID error detected");
    } else if (err instanceof import_errors.ModbusUnexpectedFunctionCodeError) {
      errorType = "ModbusUnexpectedFunctionCodeError";
      logger.error("Unexpected function code error detected");
    } else if (err instanceof import_errors.ModbusConnectionRefusedError) {
      errorType = "ModbusConnectionRefusedError";
      logger.error("Connection refused error detected");
    } else if (err instanceof import_errors.ModbusConnectionTimeoutError) {
      errorType = "ModbusConnectionTimeoutError";
      logger.error("Connection timeout error detected");
    } else if (err instanceof import_errors.ModbusNotConnectedError) {
      errorType = "ModbusNotConnectedError";
      logger.error("Not connected error detected");
    } else if (err instanceof import_errors.ModbusAlreadyConnectedError) {
      errorType = "ModbusAlreadyConnectedError";
      logger.error("Already connected error detected");
    } else if (err instanceof import_errors.ModbusInsufficientDataError) {
      errorType = "ModbusInsufficientDataError";
      logger.error("Insufficient data error detected");
    } else if (err instanceof import_errors.ModbusGatewayPathUnavailableError) {
      errorType = "ModbusGatewayPathUnavailableError";
      logger.error("Gateway path unavailable error detected");
    } else if (err instanceof import_errors.ModbusGatewayTargetDeviceError) {
      errorType = "ModbusGatewayTargetDeviceError";
      logger.error("Gateway target device error detected");
    } else if (err instanceof import_errors.ModbusInvalidStartingAddressError) {
      errorType = "ModbusInvalidStartingAddressError";
      logger.error("Invalid starting address error detected");
    } else if (err instanceof import_errors.ModbusMemoryParityError) {
      errorType = "ModbusMemoryParityError";
      logger.error("Memory parity error detected");
    } else if (err instanceof import_errors.ModbusBroadcastError) {
      errorType = "ModbusBroadcastError";
      logger.error("Broadcast error detected");
    } else if (err instanceof import_errors.ModbusGatewayBusyError) {
      errorType = "ModbusGatewayBusyError";
      logger.error("Gateway busy error detected");
    } else if (err instanceof import_errors.ModbusDataOverrunError) {
      errorType = "ModbusDataOverrunError";
      logger.error("Data overrun error detected");
    } else if (err instanceof import_errors.ModbusTooManyEmptyReadsError) {
      errorType = "ModbusTooManyEmptyReadsError";
      logger.error("Too many empty reads error detected");
    } else if (err instanceof import_errors.ModbusFlushError) {
      errorType = "ModbusFlushError";
      logger.error("Flush error detected");
    } else if (err instanceof import_errors.WebSerialTransportError) {
      errorType = "WebSerialTransportError";
      logger.error("WebSerial transport error detected");
    } else if (err instanceof import_errors.WebSerialConnectionError) {
      errorType = "WebSerialConnectionError";
      logger.error("WebSerial connection error detected");
    } else if (err instanceof import_errors.WebSerialReadError) {
      errorType = "WebSerialReadError";
      logger.error("WebSerial read error detected");
    } else if (err instanceof import_errors.WebSerialWriteError) {
      errorType = "WebSerialWriteError";
      logger.error("WebSerial write error detected");
    }
    this._handleConnectionLoss(`Error: ${err.message}`);
  }
  _onClose() {
    logger.info(`WebSerial port closed`);
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
    this._handleConnectionLoss("Port closed");
  }
  _scheduleReconnect(err) {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.info("Reconnect disabled or disconnecting, not scheduling");
      return;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for WebSerial port`
      );
      const maxAttemptsError = new import_errors.WebSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      if (this._rejectConnection) {
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, "MaxReconnectAttemptsReached", maxAttemptsError.message)
        );
      }
      return;
    }
    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect to WebSerial port in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }
  async _attemptReconnect() {
    try {
      if (this.port && this.isOpen) {
        await this._forceCloseCurrentPort();
      }
      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== "function") {
        throw new import_errors.WebSerialConnectionError(
          "Port factory did not return a valid SerialPort object."
        );
      }
      this._cleanupResources();
      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: "none"
      });
      const readable = this.port.readable;
      const writable = this.port.writable;
      if (!readable || !writable) {
        throw new import_errors.WebSerialConnectionError("Serial port not readable/writable after open");
      }
      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;
      this._startReading();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);
      this._deviceStates.clear();
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err) {
      logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${err.message}`);
      this._reconnectAttempts++;
      if (this._shouldReconnect && !this._isDisconnecting && this._reconnectAttempts <= this.options.maxReconnectAttempts) {
        this._scheduleReconnect(err);
      } else {
        const maxAttemptsError = new import_errors.WebSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        if (this._rejectConnection) {
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;
        for (const [slaveId] of this._deviceStates) {
          this._notifyDeviceConnectionListeners(
            slaveId,
            this._createState(
              slaveId,
              false,
              "MaxReconnectAttemptsReached",
              maxAttemptsError.message
            )
          );
        }
      }
    }
  }
  destroy() {
    logger.info("Destroying WebSerial transport...");
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._rejectConnection) {
      this._rejectConnection(new import_errors.WebSerialTransportError("Transport destroyed"));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }
    this._readLoopActive = false;
    this._cleanupResources();
    if (this.port) {
      try {
        this.port.close().catch(() => {
        });
      } catch (err) {
        logger.debug("Error closing port during destroy:", err.message);
      }
      this.port = null;
    }
    this.isOpen = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
  }
}
module.exports = WebSerialTransport;
