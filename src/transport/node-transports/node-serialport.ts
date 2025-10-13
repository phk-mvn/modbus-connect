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
} from '../../errors.js';
import { Transport, NodeSerialTransportOptions } from '../../types/modbus-types.js';

// Инициализация логгера
const loggerInstance = new Logger();
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', (value: unknown) => {
  return typeof value === 'string' ? `[${value}]` : '';
});
const logger = loggerInstance.createLogger('NodeSerialTransport');
logger.setLevel('info');

/**
 * Реализация транспорта для работы с последовательным портом через библиотеку `serialport`.
 * Реализует интерфейс Transport для Modbus клиента.
 */
class NodeSerialTransport implements Transport {
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
      maxBufferSize: 4096,
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
        logger.warn(`Closing existing port before reconnecting to ${this.path}`);
        await new Promise<void>((resolve, reject) => {
          this.port?.close(err => {
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
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      logger.error(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;

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
            return reject(new NodeSerialConnectionError(err.message));
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
    const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);
    if (this.readBuffer.length > this.options.maxBufferSize) {
      this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
    }
  }

  /**
   * Обрабатывает ошибки порта.
   * @private
   * @param err - Ошибка порта.
   */
  private _onError(err: Error): void {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    this.readBuffer = allocUint8Array(0);
    if (this.isOpen) {
      this.isOpen = false;
      this._removeAllListeners();
    }
  }

  /**
   * Обрабатывает событие закрытия порта.
   * @private
   */
  private _onClose(): void {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._removeAllListeners();
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
        await new Promise<void>(resolve => {
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
    const release = await this._operationMutex.acquire();
    try {
      return new Promise<void>((resolve, reject) => {
        this.port!.write(buffer, err => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);
            return reject(new NodeSerialWriteError(err.message));
          }
          this.port!.drain(drainErr => {
            if (drainErr) {
              logger.info(`Drain error on port ${this.path}: ${drainErr.message}`);
              return reject(new NodeSerialWriteError(drainErr.message));
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
  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    const start = Date.now();
    const release = await this._operationMutex.acquire();
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const checkData = () => {
          if (!this.isOpen || !this.port || !this.port.isOpen) {
            logger.info('Read operation interrupted: port is not open');
            return reject(new NodeSerialReadError('Port is closed'));
          }
          if (this._isFlushing) {
            logger.info('Read operation interrupted by flush');
            return reject(new ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = sliceUint8Array(this.readBuffer, length);
            logger.trace(`Read ${length} bytes from ${this.path}`);
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.error(`Read timeout on ${this.path}`);
            return reject(new NodeSerialReadError('Read timeout'));
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
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this._removeAllListeners();
      this.port!.close(err => {
        this._isDisconnecting = false;
        this.isOpen = false;
        if (err) {
          logger.error(`Error closing port ${this.path}: ${err.message}`);
          return reject(new NodeSerialConnectionError(err.message));
        }
        logger.info(`Serial port ${this.path} closed`);
        resolve();
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
    if (this.port && this.port.isOpen) {
      try {
        this._removeAllListeners();
        this.port.close(() => {
          logger.info(`Port ${this.path} destroyed`);
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
        logger.error(`Error destroying port ${this.path}: ${error.message}`);
      }
    }
    this.isOpen = false;
    this.port = null;
  }
}

export = NodeSerialTransport;
