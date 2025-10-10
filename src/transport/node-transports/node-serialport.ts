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

const loggerInstance = new Logger();

// Настраиваем формат лога
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', value => {
  return value ? `[${value}]` : '';
});

const logger = loggerInstance.createLogger('NodeSerialTransport');
logger.setLevel('info');

class NodeSerialTransport implements Transport {
  private path: string;
  private options: Required<NodeSerialTransportOptions>;
  private port: SerialPort | null = null;
  private readBuffer: Uint8Array;
  private isOpen: boolean = false;
  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _reconnectTimeout: NodeJS.Timeout | null = null;

  // Флаг для отслеживания состояния подключения
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;

  private _isFlushing: boolean = false;
  private _pendingFlushPromises: Array<(value?: void | Promise<void>) => void> = [];
  private _operationMutex: Mutex;

  // Добавляем промис для ожидания успешного подключения
  private _connectionPromise: Promise<void> | null = null;
  private _resolveConnection: (() => void) | null = null;
  private _rejectConnection: ((reason?: Error | string | null) => void) | null = null;

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
      reconnectInterval: 3000, // ms
      maxReconnectAttempts: Infinity,
      ...options,
    };
    this.readBuffer = allocUint8Array(0);
    this._operationMutex = new Mutex();
  }

  async connect(): Promise<void> {
    // Если максимальное количество попыток достигнуто, сразу бросаем ошибку
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new NodeSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      logger.error(`Connection failed: ${error.message}`);
      throw error;
    }

    // Предотвращаем двойное подключение
    if (this._isConnecting) {
      logger.warn(`Connection attempt already in progress, waiting for it to complete`);
      if (this._connectionPromise) {
        return this._connectionPromise;
      }
      return Promise.resolve();
    }

    this._isConnecting = true;

    // Создаем промис для ожидания успешного подключения
    this._connectionPromise = new Promise((resolve, reject) => {
      this._resolveConnection = resolve;
      this._rejectConnection = reject;
    });

    try {
      // Очищаем предыдущий таймаут реконнекта
      if (this._reconnectTimeout) {
        clearTimeout(this._reconnectTimeout);
        this._reconnectTimeout = null;
      }

      // Если у нас есть старый порт, убедимся, что он закрыт
      if (this.port && this.port.isOpen) {
        logger.warn(`Closing existing port before reconnecting to ${this.path}`);
        await new Promise((resolve, reject) => {
          this.port?.close(err => {
            if (err) {
              logger.error(`Error closing existing port: ${err.message}`);
              reject();
            }
            resolve(undefined);
          });
        });
      }

      // Создаем и открываем новый порт
      await this._createAndOpenPort();

      logger.info(`Serial port ${this.path} opened`);

      // Разрешаем промис успешного подключения
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

      // Если достигнуто максимальное количество попыток, отклоняем промис
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

      // Иначе запускаем реконнект
      if (this._shouldReconnect) {
        this._scheduleReconnect(error);

        // Возвращаем промис, чтобы вызывающий код ждал результат реконнекта
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

  private _createAndOpenPort(): Promise<void> {
    return new Promise((resolve, reject) => {
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

          // Удаляем старые обработчики, если они есть
          this._removeAllListeners();

          // Добавляем новые обработчики
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

  private _removeAllListeners(): void {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }

  private _onData(data: Buffer): void {
    // Проверяем, что порт все еще открыт
    if (!this.isOpen) return;

    const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);

    if (this.readBuffer.length > this.options.maxBufferSize) {
      this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
    }
  }

  private _onError(err: Error): void {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    this.readBuffer = allocUint8Array(0);
    // Порт может быть уже закрыт, но если нет - закрываем
    if (this.isOpen) {
      this.isOpen = false;
      this._removeAllListeners();
    }
  }

  private _onClose(): void {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._removeAllListeners();

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new NodeSerialConnectionError('Port closed'));
    }
  }

  private _scheduleReconnect(err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.warn('Reconnect disabled or disconnecting, not scheduling');
      return;
    }

    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }

    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for ${this.path}`
      );
      // Отклоняем промис, если достигнуто максимальное количество попыток
      if (this._rejectConnection) {
        const maxAttemptsError = new NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      // Останавливаем реконнект
      this._shouldReconnect = false;
      return;
    }

    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect to ${this.path} in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );

    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      // Делаем реконнект напрямую, без рекурсивного вызова connect()
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

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

      // Разрешаем промис, если он еще существует
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

  async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.port || !this.port.isOpen) {
      logger.info(`Write attempted on closed port ${this.path}`);
      throw new NodeSerialWriteError('Port is closed');
    }

    const release = await this._operationMutex.acquire();
    try {
      return new Promise<void>((resolve, reject) => {
        this.port?.write(buffer, err => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);
            return reject(new NodeSerialWriteError(err.message));
          }
          this.port?.drain(drainErr => {
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

  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    const start = Date.now();

    const release = await this._operationMutex.acquire();
    try {
      return new Promise<Uint8Array>((resolve, reject) => {
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

  async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;

    // Очищаем таймаут реконнекта
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }

    // Отклоняем промис подключения при отключении
    if (this._rejectConnection) {
      this._rejectConnection(new NodeSerialConnectionError('Connection manually disconnected'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    // Если порт уже закрыт, просто возвращаем
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      // Удаляем все обработчики событий
      this._removeAllListeners();

      this.port?.close(err => {
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

  // Дополнительный метод для принудительной очистки
  destroy(): void {
    this._shouldReconnect = false;

    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }

    // Отклоняем промис при уничтожении
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

export { NodeSerialTransport };
