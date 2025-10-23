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
const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 10,
  VALID_BAUD_RATES: [300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
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
  ERROR_HANDLERS[err.constructor.name]?.() || logger.error(`Unknown error: ${err.message}`);
};
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
      maxBufferSize: NODE_SERIAL_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
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
  // ========== ЕДИНЫЙ МЕТОД ОЧИСТКИ ==========
  async _releaseAllResources() {
    logger.debug("Releasing NodeSerial resources");
    this._removeAllListeners();
    if (this.port && this.port.isOpen) {
      await new Promise((resolve) => {
        this.port.close(() => {
          logger.debug("Port closed successfully");
          resolve();
        });
      });
    }
    this.port = null;
    this.isOpen = false;
    this.readBuffer = (0, import_utils.allocUint8Array)(0);
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
        logger.debug(`Closing existing port before reconnecting to ${this.path}`);
        await this._releaseAllResources();
      }
      if (this.options.baudRate < NODE_SERIAL_CONSTANTS.MIN_BAUD_RATE || this.options.baudRate > NODE_SERIAL_CONSTANTS.MAX_BAUD_RATE) {
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
        await this._releaseAllResources();
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
              this._handleError(drainError);
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
    let emptyReadAttempts = 0;
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
            emptyReadAttempts = 0;
            if (data.length !== length) {
              const insufficientDataError = new import_errors.ModbusInsufficientDataError(data.length, length);
              return reject(insufficientDataError);
            }
            return resolve(data);
          }
          if (this.readBuffer.length === 0) {
            emptyReadAttempts++;
            if (emptyReadAttempts >= 3) {
              logger.debug("Auto-reconnecting NodeSerialTransport - 3 empty reads detected", {
                path: this.path,
                timeout,
                emptyAttempts: emptyReadAttempts
              });
              emptyReadAttempts = 0;
              this.connect().catch((reconnectErr) => {
                logger.error("Auto-reconnect failed during read", {
                  path: this.path,
                  error: reconnectErr
                });
              });
            }
          } else {
            emptyReadAttempts = 0;
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on NodeSerial port`);
            const timeoutError = new import_errors.ModbusTimeoutError("Read timeout");
            return reject(timeoutError);
          }
          setTimeout(checkData, NODE_SERIAL_CONSTANTS.POLL_INTERVAL_MS);
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
      this._releaseAllResources().then(() => {
        this._isDisconnecting = false;
        logger.info(`Serial port ${this.path} closed`);
        for (const [slaveId] of this._deviceStates) {
          this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
        }
        this._deviceStates.clear();
        resolve();
      }).catch((err) => {
        this._isDisconnecting = false;
        const closeError = new import_errors.NodeSerialConnectionError(err.message);
        for (const [slaveId] of this._deviceStates) {
          this._notifyDeviceConnectionListeners(
            slaveId,
            this._createState(slaveId, false, "NodeSerialConnectionError", closeError.message)
          );
        }
        this._deviceStates.clear();
        reject(closeError);
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
    this._releaseAllResources().catch(() => {
    });
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
  }
  _handleError(err) {
    handleModbusError(err);
  }
}
module.exports = NodeSerialTransport;
