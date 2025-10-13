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
var node_serialport_exports = {};
__export(node_serialport_exports, {
  NodeSerialTransport: () => NodeSerialTransport
});
module.exports = __toCommonJS(node_serialport_exports);
var import_serialport = require("serialport");
var import_async_mutex = require("async-mutex");
var import_utils = require("../../utils/utils.js");
var import_logger = __toESM(require("../../logger.js"));
var import_errors = require("../../errors.js");
const loggerInstance = new import_logger.default();
loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
loggerInstance.setCustomFormatter("logger", (value) => {
  return typeof value === "string" ? `[${value}]` : "";
});
const logger = loggerInstance.createLogger("NodeSerialTransport");
logger.setLevel("info");
class NodeSerialTransport {
  path;
  options;
  port;
  readBuffer;
  isOpen;
  _reconnectAttempts;
  _shouldReconnect;
  _reconnectTimeout;
  _isConnecting;
  _isDisconnecting;
  _isFlushing;
  _pendingFlushPromises;
  _operationMutex;
  _connectionPromise;
  _resolveConnection;
  _rejectConnection;
  /**
   * Создаёт новый экземпляр транспорта для последовательного порта.
   * @param port - Путь к последовательному порту (например, '/dev/ttyUSB0').
   * @param options - Конфигурационные параметры порта.
   */
  constructor(port, options = {}) {
    this.path = port;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      readTimeout: 1e3,
      writeTimeout: 1e3,
      maxBufferSize: 4096,
      reconnectInterval: 3e3,
      maxReconnectAttempts: Infinity,
      ...options
    };
    this.port = null;
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
    this.isOpen = false;
    this._reconnectAttempts = 0;
    this._shouldReconnect = true;
    this._reconnectTimeout = null;
    this._isConnecting = false;
    this._isDisconnecting = false;
    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._operationMutex = new import_async_mutex.Mutex();
    this._connectionPromise = null;
    this._resolveConnection = null;
    this._rejectConnection = null;
  }
  /**
   * Устанавливает соединение с последовательным портом.
   * @throws NodeSerialConnectionError - Если не удалось открыть порт или превышено количество попыток подключения.
   */
  async connect() {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new import_errors.NodeSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      logger.error(`Connection failed: ${error.message}`);
      throw error;
    }
    if (this._isConnecting) {
      logger.warn(`Connection attempt already in progress, waiting for it to complete`);
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
      if (this.port && this.port.isOpen) {
        logger.warn(`Closing existing port before reconnecting to ${this.path}`);
        await new Promise((resolve, reject) => {
          this.port?.close((err) => {
            if (err) {
              logger.error(`Error closing existing port: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
      await this._createAndOpenPort();
      logger.info(`Serial port ${this.path} opened`);
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      return this._connectionPromise;
    } catch (err) {
      const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
      logger.error(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;
      if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
        const maxAttemptsError = new import_errors.NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        logger.error(`Max reconnect attempts reached, connection failed`);
        if (this._rejectConnection) {
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw maxAttemptsError;
      }
      if (this._shouldReconnect) {
        this._scheduleReconnect(error);
        return this._connectionPromise;
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
  /**
   * Создаёт и открывает новый последовательный порт.
   * @private
   * @throws NodeSerialConnectionError - Если не удалось открыть порт.
   */
  async _createAndOpenPort() {
    return new Promise((resolve, reject) => {
      try {
        const serialOptions = {
          path: this.path,
          baudRate: this.options.baudRate,
          dataBits: this.options.dataBits,
          stopBits: this.options.stopBits,
          parity: this.options.parity,
          autoOpen: false
        };
        this.port = new import_serialport.SerialPort(serialOptions);
        this.port.open((err) => {
          if (err) {
            logger.error(`Failed to open serial port ${this.path}: ${err.message}`);
            this.isOpen = false;
            return reject(new import_errors.NodeSerialConnectionError(err.message));
          }
          this.isOpen = true;
          this._reconnectAttempts = 0;
          this._removeAllListeners();
          this.port?.on("data", this._onData.bind(this));
          this.port?.on("error", this._onError.bind(this));
          this.port?.on("close", this._onClose.bind(this));
          resolve();
        });
      } catch (err) {
        const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
        reject(error);
      }
    });
  }
  /**
   * Удаляет все обработчики событий порта.
   * @private
   */
  _removeAllListeners() {
    if (this.port) {
      this.port.removeAllListeners("data");
      this.port.removeAllListeners("error");
      this.port.removeAllListeners("close");
    }
  }
  /**
   * Обрабатывает входящие данные от порта.
   * @private
   * @param data - Входящие данные в виде Buffer.
   */
  _onData(data) {
    if (!this.isOpen) return;
    const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.readBuffer = (0, import_utils.concatUint8Arrays)([this.readBuffer, chunk]);
    if (this.readBuffer.length > this.options.maxBufferSize) {
      this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, -this.options.maxBufferSize);
    }
  }
  /**
   * Обрабатывает ошибки порта.
   * @private
   * @param err - Ошибка порта.
   */
  _onError(err) {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
    if (this.isOpen) {
      this.isOpen = false;
      this._removeAllListeners();
    }
  }
  /**
   * Обрабатывает событие закрытия порта.
   * @private
   */
  _onClose() {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._removeAllListeners();
    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new import_errors.NodeSerialConnectionError("Port closed"));
    }
  }
  /**
   * Планирует попытку переподключения.
   * @private
   * @param err - Ошибка, вызвавшая необходимость переподключения.
   */
  _scheduleReconnect(err) {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.warn("Reconnect disabled or disconnecting, not scheduling");
      return;
    }
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for ${this.path}`
      );
      if (this._rejectConnection) {
        const maxAttemptsError = new import_errors.NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;
      return;
    }
    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect to ${this.path} in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }
  /**
   * Выполняет попытку переподключения.
   * @private
   */
  async _attemptReconnect() {
    try {
      if (this.port && this.port.isOpen) {
        await new Promise((resolve) => {
          this.port?.close(() => resolve());
        });
      }
      await this._createAndOpenPort();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);
      this._reconnectAttempts = 0;
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
      logger.error(`Reconnect attempt ${this._reconnectAttempts} failed: ${error.message}`);
      this._reconnectAttempts++;
      if (this._shouldReconnect && !this._isDisconnecting && this._reconnectAttempts <= this.options.maxReconnectAttempts) {
        this._scheduleReconnect(error);
      } else {
        if (this._rejectConnection) {
          const maxAttemptsError = new import_errors.NodeSerialConnectionError(
            `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
          );
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;
      }
    }
  }
  /**
   * Очищает буфер чтения транспорта.
   * @returns Промис, который разрешается после завершения очистки.
   */
  async flush() {
    logger.info("Flushing NodeSerial transport buffer");
    if (this._isFlushing) {
      logger.info("Flush already in progress");
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
      logger.info("NodeSerial read buffer flushed");
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach((resolve) => resolve());
      this._pendingFlushPromises = [];
      logger.info("NodeSerial transport flush completed");
    }
    return flushPromise;
  }
  /**
   * Записывает данные в последовательный порт.
   * @param buffer - Данные для записи.
   * @throws NodeSerialWriteError - Если порт закрыт или произошла ошибка записи.
   */
  async write(buffer) {
    if (!this.isOpen || !this.port || !this.port.isOpen) {
      logger.info(`Write attempted on closed port ${this.path}`);
      throw new import_errors.NodeSerialWriteError("Port is closed");
    }
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        this.port.write(buffer, (err) => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);
            return reject(new import_errors.NodeSerialWriteError(err.message));
          }
          this.port.drain((drainErr) => {
            if (drainErr) {
              logger.info(`Drain error on port ${this.path}: ${drainErr.message}`);
              return reject(new import_errors.NodeSerialWriteError(drainErr.message));
            }
            resolve();
          });
        });
      });
    } finally {
      release();
    }
  }
  /**
   * Читает данные из последовательного порта.
   * @param length - Количество байтов для чтения.
   * @param timeout - Таймаут чтения в миллисекундах (по умолчанию из опций).
   * @returns Прочитанные данные.
   * @throws NodeSerialReadError - Если порт закрыт или таймаут чтения истёк.
   * @throws ModbusFlushError - Если операция чтения прервана очисткой буфера.
   */
  async read(length, timeout = this.options.readTimeout) {
    const start = Date.now();
    const release = await this._operationMutex.acquire();
    try {
      return await new Promise((resolve, reject) => {
        const checkData = () => {
          if (!this.isOpen || !this.port || !this.port.isOpen) {
            logger.info("Read operation interrupted: port is not open");
            return reject(new import_errors.NodeSerialReadError("Port is closed"));
          }
          if (this._isFlushing) {
            logger.info("Read operation interrupted by flush");
            return reject(new import_errors.ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = (0, import_utils.sliceUint8Array)(this.readBuffer, 0, length);
            this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, length);
            logger.trace(`Read ${length} bytes from ${this.path}`);
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.error(`Read timeout on ${this.path}`);
            return reject(new import_errors.NodeSerialReadError("Read timeout"));
          }
          setTimeout(checkData, 10);
        };
        checkData();
      });
    } finally {
      release();
    }
  }
  /**
   * Закрывает соединение с последовательным портом.
   * @returns Промис, который разрешается после закрытия порта.
   * @throws NodeSerialConnectionError - Если произошла ошибка при закрытии порта.
   */
  async disconnect() {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._rejectConnection) {
      this._rejectConnection(new import_errors.NodeSerialConnectionError("Connection manually disconnected"));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._removeAllListeners();
      this.port.close((err) => {
        this._isDisconnecting = false;
        this.isOpen = false;
        if (err) {
          logger.error(`Error closing port ${this.path}: ${err.message}`);
          return reject(new import_errors.NodeSerialConnectionError(err.message));
        }
        logger.info(`Serial port ${this.path} closed`);
        resolve();
      });
    });
  }
  /**
   * Полностью уничтожает транспорт, закрывая порт и очищая ресурсы.
   */
  destroy() {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._rejectConnection) {
      this._rejectConnection(new import_errors.NodeSerialTransportError("Transport destroyed"));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }
    if (this.port && this.port.isOpen) {
      try {
        this._removeAllListeners();
        this.port.close(() => {
          logger.info(`Port ${this.path} destroyed`);
        });
      } catch (err) {
        const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
        logger.error(`Error destroying port ${this.path}: ${error.message}`);
      }
    }
    this.isOpen = false;
    this.port = null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NodeSerialTransport
});
