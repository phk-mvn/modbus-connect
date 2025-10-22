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
  // Слушатели состояния связи с устройством
  _deviceConnectionListeners = [];
  // Карта состояний для каждого slaveId
  _deviceStates = /* @__PURE__ */ new Map();
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
      if (this.options.baudRate < 300 || this.options.baudRate > 115200) {
        throw new import_errors.ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
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
      if (error instanceof import_errors.ModbusConfigError) {
        logger.error("Configuration error during connection");
      } else if (error instanceof import_errors.NodeSerialConnectionError) {
        logger.error("Connection error during port opening");
      }
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, error.constructor.name, error.message)
        );
      }
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
            if (err.message.includes("permission")) {
              reject(new import_errors.NodeSerialConnectionError("Permission denied to access serial port"));
            } else if (err.message.includes("busy")) {
              reject(new import_errors.NodeSerialConnectionError("Serial port is busy"));
            } else if (err.message.includes("no such file")) {
              reject(new import_errors.NodeSerialConnectionError("Serial port does not exist"));
            } else {
              reject(new import_errors.NodeSerialConnectionError(err.message));
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
    try {
      const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
        logger.error("Buffer overflow detected");
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
      const error = err instanceof Error ? err : new import_errors.NodeSerialTransportError(String(err));
      this._handleError(error);
    }
  }
  /**
   * Обрабатывает ошибки порта.
   * @private
   * @param err - Ошибка порта.
   */
  _onError(err) {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    if (err.message.includes("parity") || err.message.includes("Parity")) {
      this._handleError(new import_errors.ModbusParityError(err.message));
    } else if (err.message.includes("frame") || err.message.includes("Framing")) {
      this._handleError(new import_errors.ModbusFramingError(err.message));
    } else if (err.message.includes("overrun")) {
      this._handleError(new import_errors.ModbusOverrunError(err.message));
    } else if (err.message.includes("collision")) {
      this._handleError(new import_errors.ModbusCollisionError(err.message));
    } else if (err.message.includes("noise")) {
      this._handleError(new import_errors.ModbusNoiseError(err.message));
    } else if (err.message.includes("buffer")) {
      this._handleError(new import_errors.ModbusBufferOverflowError(0, 0));
    } else {
      this._handleError(new import_errors.NodeSerialTransportError(err.message));
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
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
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
      for (const [slaveId] of this._deviceStates) {
        const maxAttemptsError = new import_errors.NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, "MaxReconnectAttemptsReached", maxAttemptsError.message)
        );
      }
      this._deviceStates.clear();
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
      this._deviceStates.clear();
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
        for (const [slaveId] of this._deviceStates) {
          const maxAttemptsError = new import_errors.NodeSerialConnectionError(
            `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
          );
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
        this._deviceStates.clear();
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
    if (buffer.length === 0) {
      throw new import_errors.ModbusBufferUnderrunError(0, 1);
    }
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        this.port.write(buffer, (err) => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);
            if (err.message.includes("parity")) {
              const parityError = new import_errors.ModbusParityError(err.message);
              this._handleError(parityError);
              return reject(parityError);
            } else if (err.message.includes("collision")) {
              const collisionError = new import_errors.ModbusCollisionError(err.message);
              this._handleError(collisionError);
              return reject(collisionError);
            } else {
              const writeError = new import_errors.NodeSerialWriteError(err.message);
              this._handleError(writeError);
              return reject(writeError);
            }
          }
          this.port.drain((drainErr) => {
            if (drainErr) {
              logger.info(`Drain error on port ${this.path}: ${drainErr.message}`);
              const drainError = new import_errors.NodeSerialWriteError(drainErr.message);
              return reject(drainError);
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
    if (length <= 0) {
      throw new import_errors.ModbusDataConversionError(length, "positive integer");
    }
    const start = Date.now();
    const release = await this._operationMutex.acquire();
    try {
      return await new Promise((resolve, reject) => {
        const checkData = () => {
          if (!this.isOpen || !this.port || !this.port.isOpen) {
            logger.info("Read operation interrupted: port is not open");
            const readError = new import_errors.NodeSerialReadError("Port is closed");
            return reject(readError);
          }
          if (this._isFlushing) {
            logger.info("Read operation interrupted by flush");
            const flushError = new import_errors.ModbusFlushError();
            return reject(flushError);
          }
          if (this.readBuffer.length >= length) {
            const data = (0, import_utils.sliceUint8Array)(this.readBuffer, 0, length);
            this.readBuffer = (0, import_utils.sliceUint8Array)(this.readBuffer, length);
            logger.trace(`Read ${length} bytes from ${this.path}`);
            if (data.length !== length) {
              const insufficientDataError = new import_errors.ModbusInsufficientDataError(data.length, length);
              return reject(insufficientDataError);
            }
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on NodeSerial port`);
            const timeoutError = new import_errors.ModbusTimeoutError("Read timeout");
            return reject(timeoutError);
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
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
      }
      this._deviceStates.clear();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._removeAllListeners();
      this.port.close((err) => {
        this._isDisconnecting = false;
        this.isOpen = false;
        if (err) {
          logger.error(`Error closing port ${this.path}: ${err.message}`);
          const closeError = new import_errors.NodeSerialConnectionError(err.message);
          for (const [slaveId] of this._deviceStates) {
            this._notifyDeviceConnectionListeners(
              slaveId,
              this._createState(slaveId, false, "NodeSerialConnectionError", closeError.message)
            );
          }
          this._deviceStates.clear();
          return reject(closeError);
        }
        logger.info(`Serial port ${this.path} closed`);
        for (const [slaveId] of this._deviceStates) {
          this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
        }
        this._deviceStates.clear();
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
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
  }
  /**
   * Обрабатывает ошибки и логирует их.
   * @private
   * @param err - Ошибка для обработки.
   */
  _handleError(err) {
    logger.error(`NodeSerial port error: ${err.message}`);
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
    } else if (err instanceof import_errors.NodeSerialTransportError) {
      errorType = "NodeSerialTransportError";
      logger.error("NodeSerial transport error detected");
    } else if (err instanceof import_errors.NodeSerialConnectionError) {
      errorType = "NodeSerialConnectionError";
      logger.error("NodeSerial connection error detected");
    } else if (err instanceof import_errors.NodeSerialReadError) {
      errorType = "NodeSerialReadError";
      logger.error("NodeSerial read error detected");
    } else if (err instanceof import_errors.NodeSerialWriteError) {
      errorType = "NodeSerialWriteError";
      logger.error("NodeSerial write error detected");
    } else if (err instanceof import_errors.ModbusInterFrameTimeoutError) {
      errorType = "ModbusInterFrameTimeoutError";
      logger.error("Inter-frame timeout error detected");
    } else if (err instanceof import_errors.ModbusSilentIntervalError) {
      errorType = "ModbusSilentIntervalError";
      logger.error("Silent interval error detected");
    }
  }
}
module.exports = NodeSerialTransport;
