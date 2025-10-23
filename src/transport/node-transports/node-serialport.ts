// src/transport/node-transports/node-serialport.ts

import { SerialPort, SerialPortOpenOptions } from 'serialport';
import { Mutex } from 'async-mutex';
import { concatUint8Arrays, sliceUint8Array, allocUint8Array } from '../../utils/utils.js';
import Logger from '../../logger.js';
import {
  ModbusFlushError,
  NodeSerialTransportError,
  NodeSerialConnectionError,
  NodeSerialReadError,
  NodeSerialWriteError,
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
  ModbusCRCError,
  ModbusParityError,
  ModbusNoiseError,
  ModbusFramingError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusConfigError,
  ModbusBaudRateError,
  ModbusSyncError,
  ModbusFrameBoundaryError,
  ModbusLRCError,
  ModbusChecksumError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusMemoryError,
  ModbusStackOverflowError,
  ModbusResponseError,
  ModbusInvalidAddressError,
  ModbusInvalidFunctionCodeError,
  ModbusInvalidQuantityError,
  ModbusIllegalDataAddressError,
  ModbusIllegalDataValueError,
  ModbusSlaveBusyError,
  ModbusAcknowledgeError,
  ModbusSlaveDeviceFailureError,
  ModbusMalformedFrameError,
  ModbusInvalidFrameLengthError,
  ModbusInvalidTransactionIdError,
  ModbusUnexpectedFunctionCodeError,
  ModbusConnectionRefusedError,
  ModbusConnectionTimeoutError,
  ModbusNotConnectedError,
  ModbusAlreadyConnectedError,
  ModbusInsufficientDataError,
  ModbusGatewayPathUnavailableError,
  ModbusGatewayTargetDeviceError,
  ModbusInvalidStartingAddressError,
  ModbusMemoryParityError,
  ModbusBroadcastError,
  ModbusGatewayBusyError,
  ModbusDataOverrunError,
  ModbusInterFrameTimeoutError,
  ModbusSilentIntervalError,
} from '../../errors.js';
import { Transport, NodeSerialTransportOptions } from '../../types/modbus-types.js';

// ========== CONSTANTS ==========
const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 10,
  VALID_BAUD_RATES: [300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const,
} as const;

// ========== ERROR HANDLERS ==========
const loggerInstance = new Logger();
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', (value: unknown) => {
  return typeof value === 'string' ? `[${value}]` : '';
});
const logger = loggerInstance.createLogger('NodeSerialTransport');
logger.setLevel('info');

const ERROR_HANDLERS: Record<string, () => void> = {
  [ModbusTimeoutError.name]: () => logger.error('Timeout error detected'),
  [ModbusCRCError.name]: () => logger.error('CRC error detected'),
  [ModbusParityError.name]: () => logger.error('Parity error detected'),
  [ModbusNoiseError.name]: () => logger.error('Noise error detected'),
  [ModbusFramingError.name]: () => logger.error('Framing error detected'),
  [ModbusOverrunError.name]: () => logger.error('Overrun error detected'),
  [ModbusCollisionError.name]: () => logger.error('Collision error detected'),
  [ModbusConfigError.name]: () => logger.error('Configuration error detected'),
  [ModbusBaudRateError.name]: () => logger.error('Baud rate error detected'),
  [ModbusSyncError.name]: () => logger.error('Sync error detected'),
  [ModbusFrameBoundaryError.name]: () => logger.error('Frame boundary error detected'),
  [ModbusLRCError.name]: () => logger.error('LRC error detected'),
  [ModbusChecksumError.name]: () => logger.error('Checksum error detected'),
  [ModbusDataConversionError.name]: () => logger.error('Data conversion error detected'),
  [ModbusBufferOverflowError.name]: () => logger.error('Buffer overflow error detected'),
  [ModbusBufferUnderrunError.name]: () => logger.error('Buffer underrun error detected'),
  [ModbusMemoryError.name]: () => logger.error('Memory error detected'),
  [ModbusStackOverflowError.name]: () => logger.error('Stack overflow error detected'),
  [ModbusResponseError.name]: () => logger.error('Response error detected'),
  [ModbusInvalidAddressError.name]: () => logger.error('Invalid address error detected'),
  [ModbusInvalidFunctionCodeError.name]: () => logger.error('Invalid function code error detected'),
  [ModbusInvalidQuantityError.name]: () => logger.error('Invalid quantity error detected'),
  [ModbusIllegalDataAddressError.name]: () => logger.error('Illegal data address error detected'),
  [ModbusIllegalDataValueError.name]: () => logger.error('Illegal data value error detected'),
  [ModbusSlaveBusyError.name]: () => logger.error('Slave busy error detected'),
  [ModbusAcknowledgeError.name]: () => logger.error('Acknowledge error detected'),
  [ModbusSlaveDeviceFailureError.name]: () => logger.error('Slave device failure error detected'),
  [ModbusMalformedFrameError.name]: () => logger.error('Malformed frame error detected'),
  [ModbusInvalidFrameLengthError.name]: () => logger.error('Invalid frame length error detected'),
  [ModbusInvalidTransactionIdError.name]: () =>
    logger.error('Invalid transaction ID error detected'),
  [ModbusUnexpectedFunctionCodeError.name]: () =>
    logger.error('Unexpected function code error detected'),
  [ModbusConnectionRefusedError.name]: () => logger.error('Connection refused error detected'),
  [ModbusConnectionTimeoutError.name]: () => logger.error('Connection timeout error detected'),
  [ModbusNotConnectedError.name]: () => logger.error('Not connected error detected'),
  [ModbusAlreadyConnectedError.name]: () => logger.error('Already connected error detected'),
  [ModbusInsufficientDataError.name]: () => logger.error('Insufficient data error detected'),
  [ModbusGatewayPathUnavailableError.name]: () =>
    logger.error('Gateway path unavailable error detected'),
  [ModbusGatewayTargetDeviceError.name]: () => logger.error('Gateway target device error detected'),
  [ModbusInvalidStartingAddressError.name]: () =>
    logger.error('Invalid starting address error detected'),
  [ModbusMemoryParityError.name]: () => logger.error('Memory parity error detected'),
  [ModbusBroadcastError.name]: () => logger.error('Broadcast error detected'),
  [ModbusGatewayBusyError.name]: () => logger.error('Gateway busy error detected'),
  [ModbusDataOverrunError.name]: () => logger.error('Data overrun error detected'),
  [ModbusInterFrameTimeoutError.name]: () => logger.error('Inter-frame timeout error detected'),
  [ModbusSilentIntervalError.name]: () => logger.error('Silent interval error detected'),
  [ModbusTooManyEmptyReadsError.name]: () => logger.error('Too many empty reads error detected'),
  [ModbusFlushError.name]: () => logger.error('Flush error detected'),
  [NodeSerialTransportError.name]: () => logger.error('NodeSerial transport error detected'),
  [NodeSerialConnectionError.name]: () => logger.error('NodeSerial connection error detected'),
  [NodeSerialReadError.name]: () => logger.error('NodeSerial read error detected'),
  [NodeSerialWriteError.name]: () => logger.error('NodeSerial write error detected'),
};

const handleModbusError = (err: Error): void => {
  ERROR_HANDLERS[err.constructor.name]?.() || logger.error(`Unknown error: ${err.message}`);
};

// Типы для состояния связи с устройством
interface DeviceConnectionStateObject {
  slaveId: number;
  hasConnectionDevice: boolean;
  errorType?: string;
  errorMessage?: string;
}

type DeviceConnectionListener = (state: DeviceConnectionStateObject) => void;

// Интерфейс расширенного транспорта для отслеживания состояния устройств
interface ExtendedTransport extends Transport {
  notifyDeviceConnected?(slaveId: number): void;
  notifyDeviceDisconnected?(slaveId: number, errorType?: string, errorMessage?: string): void;
}

/**
 * Реализация транспорта для работы с последовательным портом через библиотеку `serialport`.
 * Реализует интерфейс Transport для Modbus клиента.
 */
class NodeSerialTransport implements ExtendedTransport {
  private path: string;
  private options: Required<NodeSerialTransportOptions>;
  private port: SerialPort | null;
  private readBuffer: Uint8Array;
  private isOpen: boolean;
  private _reconnectAttempts: number;
  private _shouldReconnect: boolean;
  private _reconnectTimeout: NodeJS.Timeout | null;
  private _isConnecting: boolean;
  private _isDisconnecting: boolean;
  private _isFlushing: boolean;
  private _pendingFlushPromises: Array<() => void>;
  private _operationMutex: Mutex;
  private _connectionPromise: Promise<void> | null;
  private _resolveConnection: (() => void) | null;
  private _rejectConnection: ((reason?: Error | string | null) => void) | null;

  // Слушатели состояния связи с устройством
  private _deviceConnectionListeners: DeviceConnectionListener[] = [];
  // Карта состояний для каждого slaveId
  private _deviceStates: Map<number, DeviceConnectionStateObject> = new Map();

  /**
   * Создаёт новый экземпляр транспорта для последовательного порта.
   * @param port - Путь к последовательному порту (например, '/dev/ttyUSB0').
   * @param options - Конфигурационные параметры порта.
   */
  constructor(port: string, options: NodeSerialTransportOptions = {}) {
    this.path = port;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      readTimeout: 1000,
      writeTimeout: 1000,
      maxBufferSize: NODE_SERIAL_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
      reconnectInterval: 3000,
      maxReconnectAttempts: Infinity,
      ...options,
    };
    this.port = null;
    this.readBuffer = allocUint8Array(0);
    this.isOpen = false;
    this._reconnectAttempts = 0;
    this._shouldReconnect = true;
    this._reconnectTimeout = null;
    this._isConnecting = false;
    this._isDisconnecting = false;
    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._operationMutex = new Mutex();
    this._connectionPromise = null;
    this._resolveConnection = null;
    this._rejectConnection = null;
  }

  // Публичный метод для добавления слушателя состояния связи с устройством
  addDeviceConnectionListener(listener: DeviceConnectionListener): void {
    this._deviceConnectionListeners.push(listener);
    // Вызываем слушатель для всех текущих состояний
    for (const state of this._deviceStates.values()) {
      listener(state);
    }
  }

  // Публичный метод для удаления слушателя состояния связи с устройством
  removeDeviceConnectionListener(listener: DeviceConnectionListener): void {
    const index = this._deviceConnectionListeners.indexOf(listener);
    if (index !== -1) {
      this._deviceConnectionListeners.splice(index, 1);
    }
  }

  // Приватный метод для уведомления слушателей о смене состояния конкретного slaveId
  private _notifyDeviceConnectionListeners(
    slaveId: number,
    state: DeviceConnectionStateObject
  ): void {
    // Обновляем состояние в карте
    this._deviceStates.set(slaveId, state);
    logger.debug(`Device connection state changed for slaveId ${slaveId}:`, state);

    // Копируем массив слушателей, чтобы избежать проблем при изменении во время итерации
    const listeners = [...this._deviceConnectionListeners];
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (err: unknown) {
        logger.error(
          `Error in device connection listener for slaveId ${slaveId}: ${(err as Error).message}`
        );
      }
    }
  }

  // Приватный метод для создания объекта состояния подключения
  private _createState(
    slaveId: number,
    hasConnection: boolean,
    errorType?: string,
    errorMessage?: string
  ): DeviceConnectionStateObject {
    if (hasConnection) {
      return {
        slaveId,
        hasConnectionDevice: true,
        errorType: undefined,
        errorMessage: undefined,
      };
    } else {
      return {
        slaveId,
        hasConnectionDevice: false,
        errorType: errorType,
        errorMessage: errorMessage,
      };
    }
  }

  // Метод для установки состояния устройства как подключенного
  // Вызывается из ModbusClient при успешном обмене
  notifyDeviceConnected(slaveId: number): void {
    const currentState = this._deviceStates.get(slaveId);
    if (!currentState || !currentState.hasConnectionDevice) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, true));
    }
  }

  // Метод для установки состояния устройства как отключенного
  // Вызывается из ModbusClient при ошибке обмена
  notifyDeviceDisconnected(slaveId: number, errorType?: string, errorMessage?: string): void {
    this._notifyDeviceConnectionListeners(
      slaveId,
      this._createState(slaveId, false, errorType, errorMessage)
    );
  }

  // ========== ЕДИНЫЙ МЕТОД ОЧИСТКИ ==========
  private async _releaseAllResources(): Promise<void> {
    logger.debug('Releasing NodeSerial resources');

    this._removeAllListeners();

    if (this.port && this.port.isOpen) {
      await new Promise<void>(resolve => {
        this.port!.close(() => {
          logger.debug('Port closed successfully');
          resolve();
        });
      });
    }

    this.port = null;
    this.isOpen = false;
    this.readBuffer = allocUint8Array(0);
  }

  /**
   * Устанавливает соединение с последовательным портом.
   * @throws NodeSerialConnectionError - Если не удалось открыть порт или превышено количество попыток подключения.
   */
  async connect(): Promise<void> {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new NodeSerialConnectionError(
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
    this._connectionPromise = new Promise<void>((resolve, reject) => {
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

      // Validate port configuration
      if (
        this.options.baudRate < NODE_SERIAL_CONSTANTS.MIN_BAUD_RATE ||
        this.options.baudRate > NODE_SERIAL_CONSTANTS.MAX_BAUD_RATE
      ) {
        throw new ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }

      await this._createAndOpenPort();
      logger.info(`Serial port ${this.path} opened`);

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      return this._connectionPromise;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      logger.error(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;

      if (error instanceof ModbusConfigError) {
        logger.error('Configuration error during connection');
      } else if (error instanceof NodeSerialConnectionError) {
        logger.error('Connection error during port opening');
      }

      // Уведомляем слушателей об ошибке подключения
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, error.constructor.name, error.message)
        );
      }

      if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
        const maxAttemptsError = new NodeSerialConnectionError(
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
  private async _createAndOpenPort(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const serialOptions: SerialPortOpenOptions<any> = {
          path: this.path,
          baudRate: this.options.baudRate,
          dataBits: this.options.dataBits,
          stopBits: this.options.stopBits,
          parity: this.options.parity,
          autoOpen: false,
        };
        this.port = new SerialPort(serialOptions);
        this.port.open(err => {
          if (err) {
            logger.error(`Failed to open serial port ${this.path}: ${err.message}`);
            this.isOpen = false;

            // Check for specific error types
            if (err.message.includes('permission')) {
              reject(new NodeSerialConnectionError('Permission denied to access serial port'));
            } else if (err.message.includes('busy')) {
              reject(new NodeSerialConnectionError('Serial port is busy'));
            } else if (err.message.includes('no such file')) {
              reject(new NodeSerialConnectionError('Serial port does not exist'));
            } else {
              reject(new NodeSerialConnectionError(err.message));
            }
            return;
          }
          this.isOpen = true;
          this._reconnectAttempts = 0;
          this._removeAllListeners();
          this.port?.on('data', this._onData.bind(this));
          this.port?.on('error', this._onError.bind(this));
          this.port?.on('close', this._onClose.bind(this));
          resolve();
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
        reject(error);
      }
    });
  }

  /**
   * Удаляет все обработчики событий порта.
   * @private
   */
  private _removeAllListeners(): void {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }

  /**
   * Обрабатывает входящие данные от порта.
   * @private
   * @param data - Входящие данные в виде Buffer.
   */
  private _onData(data: Buffer): void {
    if (!this.isOpen) return;

    try {
      const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      // Check for buffer overflow
      if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
        logger.error('Buffer overflow detected');
        this._handleError(
          new ModbusBufferOverflowError(
            this.readBuffer.length + chunk.length,
            this.options.maxBufferSize
          )
        );
        return;
      }

      this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);

      if (this.readBuffer.length > this.options.maxBufferSize) {
        this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
      }

      // НЕ уведомляем о получении данных от устройства здесь
      // Это делается на уровне клиента при успешной обработке ответа
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      this._handleError(error);
    }
  }

  /**
   * Обрабатывает ошибки порта.
   * @private
   * @param err - Ошибка порта.
   */
  private _onError(err: Error): void {
    logger.error(`Serial port ${this.path} error: ${err.message}`);

    // Check for specific error types
    if (err.message.includes('parity') || err.message.includes('Parity')) {
      this._handleError(new ModbusParityError(err.message));
    } else if (err.message.includes('frame') || err.message.includes('Framing')) {
      this._handleError(new ModbusFramingError(err.message));
    } else if (err.message.includes('overrun')) {
      this._handleError(new ModbusOverrunError(err.message));
    } else if (err.message.includes('collision')) {
      this._handleError(new ModbusCollisionError(err.message));
    } else if (err.message.includes('noise')) {
      this._handleError(new ModbusNoiseError(err.message));
    } else if (err.message.includes('buffer')) {
      this._handleError(new ModbusBufferOverflowError(0, 0)); // Use 0 as placeholder
    } else {
      this._handleError(new NodeSerialTransportError(err.message));
    }
  }

  /**
   * Обрабатывает событие закрытия порта.
   * @private
   */
  private _onClose(): void {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;

    // Очищаем все состояния устройств при закрытии порта
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new NodeSerialConnectionError('Port closed'));
    }
  }

  /**
   * Планирует попытку переподключения.
   * @private
   * @param err - Ошибка, вызвавшая необходимость переподключения.
   */
  private _scheduleReconnect(err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.warn('Reconnect disabled or disconnecting, not scheduling');
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
        const maxAttemptsError = new NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;

      // Очищаем все состояния устройств при достижении максимального количества попыток
      for (const [slaveId] of this._deviceStates) {
        const maxAttemptsError = new NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, 'MaxReconnectAttemptsReached', maxAttemptsError.message)
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
  private async _attemptReconnect(): Promise<void> {
    try {
      if (this.port && this.port.isOpen) {
        await this._releaseAllResources();
      }
      await this._createAndOpenPort();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);

      this._reconnectAttempts = 0;

      // Очищаем все состояния устройств при успешном переподключении
      // Они будут восстановлены при следующих обменах
      this._deviceStates.clear();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      logger.error(`Reconnect attempt ${this._reconnectAttempts} failed: ${error.message}`);
      this._reconnectAttempts++;
      if (
        this._shouldReconnect &&
        !this._isDisconnecting &&
        this._reconnectAttempts <= this.options.maxReconnectAttempts
      ) {
        this._scheduleReconnect(error);
      } else {
        if (this._rejectConnection) {
          const maxAttemptsError = new NodeSerialConnectionError(
            `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
          );
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;

        // Очищаем все состояния устройств при достижении максимального количества попыток
        for (const [slaveId] of this._deviceStates) {
          const maxAttemptsError = new NodeSerialConnectionError(
            `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
          );
          this._notifyDeviceConnectionListeners(
            slaveId,
            this._createState(
              slaveId,
              false,
              'MaxReconnectAttemptsReached',
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
  async flush(): Promise<void> {
    logger.info('Flushing NodeSerial transport buffer');
    if (this._isFlushing) {
      logger.info('Flush already in progress');
      await Promise.all(this._pendingFlushPromises).catch(() => {});
      return;
    }
    this._isFlushing = true;
    const flushPromise = new Promise<void>(resolve => {
      this._pendingFlushPromises.push(resolve);
    });
    try {
      this.readBuffer = allocUint8Array(0);
      logger.info('NodeSerial read buffer flushed');
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach(resolve => resolve());
      this._pendingFlushPromises = [];
      logger.info('NodeSerial transport flush completed');
    }
    return flushPromise;
  }

  /**
   * Записывает данные в последовательный порт.
   * @param buffer - Данные для записи.
   * @throws NodeSerialWriteError - Если порт закрыт или произошла ошибка записи.
   */
  async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.port || !this.port.isOpen) {
      logger.info(`Write attempted on closed port ${this.path}`);
      throw new NodeSerialWriteError('Port is closed');
    }

    // Check for buffer underrun
    if (buffer.length === 0) {
      throw new ModbusBufferUnderrunError(0, 1);
    }

    const release = await this._operationMutex.acquire();
    try {
      return new Promise<void>((resolve, reject) => {
        this.port!.write(buffer, err => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);

            // Check for specific error types
            if (err.message.includes('parity')) {
              const parityError = new ModbusParityError(err.message);
              this._handleError(parityError);
              return reject(parityError);
            } else if (err.message.includes('collision')) {
              const collisionError = new ModbusCollisionError(err.message);
              this._handleError(collisionError);
              return reject(collisionError);
            } else {
              const writeError = new NodeSerialWriteError(err.message);
              this._handleError(writeError);
              return reject(writeError);
            }
          }
          this.port!.drain(drainErr => {
            if (drainErr) {
              logger.info(`Drain error on port ${this.path}: ${drainErr.message}`);
              const drainError = new NodeSerialWriteError(drainErr.message);
              this._handleError(drainError);
              return reject(drainError);
            }
            // НЕ уведомляем о связи при отправке запроса - связь устанавливается только при получении ответа
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
  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    if (length <= 0) {
      throw new ModbusDataConversionError(length, 'positive integer');
    }

    const start = Date.now();
    const release = await this._operationMutex.acquire();
    let emptyReadAttempts = 0;
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const checkData = () => {
          if (!this.isOpen || !this.port || !this.port.isOpen) {
            logger.info('Read operation interrupted: port is not open');
            const readError = new NodeSerialReadError('Port is closed');
            return reject(readError);
          }
          if (this._isFlushing) {
            logger.info('Read operation interrupted by flush');
            const flushError = new ModbusFlushError();
            return reject(flushError);
          }
          if (this.readBuffer.length >= length) {
            const data = sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = sliceUint8Array(this.readBuffer, length);
            logger.trace(`Read ${length} bytes from ${this.path}`);
            emptyReadAttempts = 0;

            // Validate data integrity
            if (data.length !== length) {
              const insufficientDataError = new ModbusInsufficientDataError(data.length, length);
              return reject(insufficientDataError);
            }

            // НЕ уведомляем тут, т.к. не знаем slaveId
            // Это делается на уровне клиента при успешной обработке ответа

            return resolve(data);
          }

          if (this.readBuffer.length === 0) {
            emptyReadAttempts++;
            if (emptyReadAttempts >= 3) {
              logger.debug('Auto-reconnecting NodeSerialTransport - 3 empty reads detected', {
                path: this.path,
                timeout,
                emptyAttempts: emptyReadAttempts,
              });
              emptyReadAttempts = 0;

              this.connect().catch(reconnectErr => {
                logger.error('Auto-reconnect failed during read', {
                  path: this.path,
                  error: reconnectErr,
                });
              });
            }
          } else {
            emptyReadAttempts = 0;
          }

          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on NodeSerial port`);
            const timeoutError = new ModbusTimeoutError('Read timeout');
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
  async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._rejectConnection) {
      this._rejectConnection(new NodeSerialConnectionError('Connection manually disconnected'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      // Очищаем все состояния устройств при отключении порта
      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
      }
      this._deviceStates.clear();
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this._releaseAllResources()
        .then(() => {
          this._isDisconnecting = false;
          logger.info(`Serial port ${this.path} closed`);
          // Очищаем все состояния устройств при успешном закрытии порта
          for (const [slaveId] of this._deviceStates) {
            this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
          }
          this._deviceStates.clear();
          resolve();
        })
        .catch(err => {
          this._isDisconnecting = false;
          const closeError = new NodeSerialConnectionError(err.message);
          // Очищаем все состояния устройств при ошибке закрытия порта
          for (const [slaveId] of this._deviceStates) {
            this._notifyDeviceConnectionListeners(
              slaveId,
              this._createState(slaveId, false, 'NodeSerialConnectionError', closeError.message)
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
  destroy(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    if (this._rejectConnection) {
      this._rejectConnection(new NodeSerialTransportError('Transport destroyed'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    this._releaseAllResources().catch(() => {});

    // Очищаем все состояния устройств при уничтожении транспорта
    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();
  }

  private _handleError(err: Error): void {
    handleModbusError(err);
  }
}

export = NodeSerialTransport;
