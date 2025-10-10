// src/transport/web-transports/web-serialport.ts

import Logger from '../../logger.js';
import { allocUint8Array } from '../../utils/utils.js';
import { Mutex } from 'async-mutex';

import {
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
  ModbusFlushError,
  // Импортируем новые ошибки транспорта
  WebSerialTransportError,
  WebSerialConnectionError,
  WebSerialReadError,
  WebSerialWriteError,
} from '../../errors.js';

import {
  Transport,
  WebSerialPort,
  WebSerialPortOptions,
  WebSerialTransportOptions,
} from '../../types/modbus-types.js';

const loggerInstance = new Logger();

// Настраиваем формат лога
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', value => {
  return value ? `[${value}]` : '';
});

const logger = loggerInstance.createLogger('WebSerialTransport');
logger.setLevel('info');

class WebSerialTransport implements Transport {
  private portFactory: () => Promise<WebSerialPort>;
  private port: WebSerialPort | null = null; // SerialPort (Web Serial API)
  private options: Required<WebSerialTransportOptions>;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer: Uint8Array;

  private isOpen: boolean = false;
  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;

  private _isFlushing: boolean = false;
  private _pendingFlushPromises: Array<(value?: void | Promise<void>) => void> = [];
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _emptyReadCount: number = 0;
  private _readLoopActive: boolean = false;
  private _readLoopAbortController: AbortController | null = null;
  private _operationMutex: Mutex;

  private _connectionPromise: Promise<void> | null = null;
  private _resolveConnection: (() => void) | null = null;
  private _rejectConnection: ((reason?: Error | string | null) => void) | null = null;

  constructor(portFactory: () => Promise<WebSerialPort>, options: WebSerialTransportOptions = {}) {
    if (typeof portFactory !== 'function') {
      throw new WebSerialTransportError(
        'A port factory function must be provided to WebSerialTransport'
      );
    }
    this.portFactory = portFactory;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      readTimeout: 1000,
      writeTimeout: 1000,
      reconnectInterval: 3000,
      maxReconnectAttempts: Infinity,
      maxEmptyReadsBeforeReconnect: 10,
      ...options,
    };
    this.readBuffer = new Uint8Array(0);
    this._operationMutex = new Mutex();
  }

  async connect(): Promise<void> {
    if (this._isConnecting) {
      logger.warn('Connection attempt already in progress, waiting for it to complete');
      // Если у нас уже есть промис подключения, возвращаем его.
      // Это предотвращает множественные попытки подключения.
      if (this._connectionPromise) {
        return this._connectionPromise;
      }
      // Если _isConnecting true, но _connectionPromise null (неожиданное состояние),
      // разрешаем немедленно, чтобы избежать deadlock.
      return Promise.resolve();
    }

    this._isConnecting = true;

    // Создаем новый промис для отслеживания состояния подключения
    this._connectionPromise = new Promise((resolve, reject) => {
      this._resolveConnection = resolve;
      this._rejectConnection = reject;
    });

    try {
      // Очищаем предыдущий таймер реконнекта, если он был
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      // Сбрасываем счетчик пустых чтений и включаем автопереподключение
      this._shouldReconnect = true;
      this._emptyReadCount = 0;

      logger.debug('Requesting new SerialPort instance from factory...');

      // Если порт уже открыт, пытаемся его закрыть перед новым подключением
      if (this.port && this.isOpen) {
        logger.warn('Closing existing port before reconnecting');
        await this._forceCloseCurrentPort();
      }

      // Получаем новый экземпляр порта из фабрики
      this.port = await this.portFactory();
      // Проверяем, что фабрика вернула объект с методом open
      if (!this.port || typeof this.port.open !== 'function') {
        throw new WebSerialConnectionError(
          'Port factory did not return a valid SerialPort object.'
        );
      }
      logger.debug('New SerialPort instance acquired.');

      // Очищаем ресурсы от предыдущего подключения
      this._cleanupResources();

      // Открываем порт с заданными опциями
      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as WebSerialPortOptions);

      // Получаем потоки для чтения и записи
      const readable = this.port.readable;
      const writable = this.port.writable;

      // Проверяем, что порт стал доступен для чтения/записи
      if (!readable || !writable) {
        const errorMsg = 'Serial port not readable/writable after open';
        logger.error(errorMsg);
        // Принудительно закрываем порт, так как он в неправильном состоянии
        await this._forceCloseCurrentPort();
        throw new WebSerialConnectionError(errorMsg);
      }

      // Создаем reader и writer для работы с потоками
      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true; // Помечаем порт как открытый
      this._reconnectAttempts = 0; // Сбрасываем счетчик попыток реконнекта

      // Запускаем цикл чтения данных из порта
      this._startReading();
      logger.info('WebSerial port opened successfully with new instance');

      // Если у нас есть функция для разрешения промиса подключения, вызываем ее
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      // Возвращаем промис подключения
      return this._connectionPromise;
    } catch (err: unknown) {
      // Логгируем любую ошибку, возникшую при открытии порта
      logger.error(`Failed to open WebSerial port: ${(err as Error).message}`);

      // Помечаем порт как закрытый, так как подключение не удалось
      this.isOpen = false;

      // Проверяем, нужно ли пытаться переподключиться
      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        logger.info('Auto-reconnect enabled, starting reconnect process...');
        // Планируем реконнект
        this._scheduleReconnect(err as Error);

        // Возвращаем промис подключения, чтобы вызывающая сторона могла дождаться реконнекта
        return this._connectionPromise;
      } else {
        // Если реконнект невозможен или не разрешен, отклоняем промис подключения
        if (this._rejectConnection) {
          this._rejectConnection(err as Error);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        // Пробрасываем ошибку дальше
        throw err;
      }
    } finally {
      // В любом случае сбрасываем флаг подключения
      this._isConnecting = false;
    }
  }

  private async _forceCloseCurrentPort(): Promise<void> {
    // Если порта нет, ничего делать не нужно
    if (!this.port) return;

    logger.debug('Force closing current port...');

    // Останавливаем цикл чтения
    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }

    // Отменяем reader, если он существует
    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (err: unknown) {
        // Логгируем ошибку отмены, но не прерываем процесс закрытия
        logger.debug('Error cancelling reader:', (err as Error).message);
      }
      this.reader = null;
    }

    // Освобождаем writer, если он существует
    if (this.writer) {
      try {
        this.writer.releaseLock();
        await this.writer.close().catch(() => {});
      } catch (err: unknown) {
        // Логгируем ошибку освобождения writer'а, но не прерываем процесс
        logger.debug('Error releasing writer:', (err as Error).message);
      }
      this.writer = null;
    }

    // Закрываем сам порт, если он еще открыт
    if (this.port && (this.port as WebSerialPort).opened) {
      try {
        await this.port.close();
        logger.debug('Port closed successfully');
      } catch (err: unknown) {
        // Логгируем ошибку закрытия порта, но продолжаем выполнение
        logger.warn(`Error closing port: ${(err as Error).message}`);
      }
    }

    // Очищаем ссылку на порт и буфер
    this.port = null;
    this.isOpen = false;
    this.readBuffer = allocUint8Array(0);
  }

  private _cleanupResources(): void {
    logger.debug('Cleaning up WebSerial resources');

    // Останавливаем цикл чтения
    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }

    // Отменяем reader, если он существует
    if (this.reader) {
      try {
        this.reader.cancel();
        this.reader.releaseLock();
      } catch (e: unknown) {
        // Логгируем ошибку отмены reader'а
        logger.debug('Error releasing reader:', (e as Error).message);
      }
      this.reader = null;
    }

    // Освобождаем writer, если он существует
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e: unknown) {
        // Логгируем ошибку освобождения writer'а
        logger.debug('Error releasing writer:', (e as Error).message);
      }
      this.writer = null;
    }

    // Очищаем буфер чтения и сбрасываем счетчики
    this.readBuffer = allocUint8Array(0);
    this._readLoopActive = false;
    this._emptyReadCount = 0;
  }

  private _startReading(): void {
    // Проверяем, что порт открыт, reader существует и цикл чтения не активен
    if (!this.isOpen || !this.reader || this._readLoopActive) {
      logger.warn('Cannot start reading: port not open, no reader, or loop already active');
      return;
    }

    // Помечаем цикл чтения как активный и создаем контроллер для возможности его прерывания
    this._readLoopActive = true;
    this._readLoopAbortController = new AbortController();
    logger.debug('Starting read loop');

    // Асинхронная функция цикла чтения
    const loop = async (): Promise<void> => {
      try {
        // Цикл продолжается, пока порт открыт, reader существует,
        // контроллер не отменен и сигнал не прерван
        while (
          this.isOpen &&
          this.reader &&
          this._readLoopAbortController &&
          !this._readLoopAbortController.signal.aborted
        ) {
          try {
            // Читаем данные из потока
            const { value, done } = await this.reader.read();

            // Если поток закрыт или чтение прервано, завершаем цикл
            if (done || this._readLoopAbortController.signal.aborted) {
              logger.warn('WebSerial read stream closed (done=' + done + ')');
              this._readLoopActive = false;
              // Вызываем обработчик закрытия порта
              this._onClose();
              break;
            }

            // Если получены данные
            if (value && value.length > 0) {
              // Сбрасываем счетчик пустых чтений
              this._emptyReadCount = 0;
              // Создаем новый буфер для объединения старых данных и новых
              const newBuffer = new Uint8Array(this.readBuffer.length + value.length);
              // Копируем старые данные
              newBuffer.set(this.readBuffer, 0);
              // Добавляем новые данные
              newBuffer.set(value, this.readBuffer.length);
              // Обновляем буфер чтения
              this.readBuffer = newBuffer;
            } else {
              // Если данные пустые, увеличиваем счетчик
              this._emptyReadCount++;
              // Если пустых чтений слишком много, инициируем реконнект
              if (this._emptyReadCount >= this.options.maxEmptyReadsBeforeReconnect) {
                logger.warn(`Too many empty reads (${this._emptyReadCount}), triggering reconnect`);
                // Сбрасываем счетчик и останавливаем цикл чтения
                this._emptyReadCount = 0;
                this._readLoopActive = false;
                // Генерируем ошибку "слишком много пустых чтений"
                this._onError(new ModbusTooManyEmptyReadsError());
                break;
              }
            }
          } catch (readErr: unknown) {
            // Если чтение было прервано вручную, просто выходим из цикла
            if (this._readLoopAbortController.signal.aborted) {
              logger.debug('Read loop aborted');
              break;
            }
            // Логгируем ошибку чтения
            logger.warn(`Read operation error: ${(readErr as Error).message}`);
            // Останавливаем цикл чтения и вызываем обработчик ошибки
            this._readLoopActive = false;
            this._onError(readErr as Error);
            break;
          }
        }
      } catch (loopErr: unknown) {
        // Если цикл был прерван внешним образом, логгируем это
        if (this._readLoopAbortController?.signal.aborted) {
          logger.debug('Read loop aborted externally');
        } else {
          // Логгируем любую другую непредвиденную ошибку в цикле
          logger.error(`Unexpected error in read loop: ${(loopErr as Error).message}`);
          // Останавливаем цикл чтения и вызываем обработчик ошибки
          this._readLoopActive = false;
          this._onError(loopErr as Error);
        }
      } finally {
        // В любом случае помечаем цикл как неактивный
        this._readLoopActive = false;
        logger.debug('Read loop finished');
      }
    };

    // Запускаем цикл чтения и обрабатываем возможные ошибки промиса
    loop().catch(err => {
      logger.error('Read loop promise rejected:', err);
      this._readLoopActive = false;
      // Вызываем обработчик ошибки для промиса
      this._onError(err as Error);
    });
  }

  async write(buffer: Uint8Array): Promise<void> {
    // Если идет процесс сброса, прерываем запись
    if (this._isFlushing) {
      logger.debug('Write operation aborted due to ongoing flush');
      throw new ModbusFlushError();
    }

    // Проверяем, что порт открыт и writer существует
    if (!this.isOpen || !this.writer) {
      logger.warn(`Write attempted on closed/unready port`);
      throw new WebSerialWriteError('Port is closed or not ready for writing');
    }

    // Получаем блокировку для синхронизации операций записи
    const release = await this._operationMutex.acquire();
    try {
      // Получаем таймаут записи из опций
      const timeout = this.options.writeTimeout;
      // Создаем контроллер для возможности прерывания по таймауту
      const abort = new AbortController();
      // Устанавливаем таймер для прерывания
      const timer = setTimeout(() => abort.abort(), timeout);

      try {
        // Пытаемся записать данные в порт
        await this.writer.write(buffer);
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`);
      } catch (err: unknown) {
        // Если операция была прервана по таймауту
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`);
          // Вызываем обработчик ошибки таймаута
          this._onError(new ModbusTimeoutError('Write timeout'));
          throw new ModbusTimeoutError('Write timeout');
        } else {
          // Логгируем ошибку записи
          logger.error(`Write error on WebSerial port: ${(err as Error).message}`);
          // Вызываем обработчик ошибки записи
          this._onError(new WebSerialWriteError((err as Error).message));
          throw err;
        }
      } finally {
        // Очищаем таймер и прерываем сигнал
        clearTimeout(timer);
        abort.abort();
      }
    } finally {
      // Освобождаем блокировку
      release();
    }
  }

  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    // Проверяем, что порт открыт
    if (!this.isOpen) {
      logger.warn('Read attempted on closed port');
      throw new WebSerialReadError('Port is closed');
    }

    // Получаем блокировку для синхронизации операций чтения
    const release = await this._operationMutex.acquire();
    try {
      // Запоминаем время начала операции
      const start = Date.now();

      // Возвращаем промис, который разрешится, когда в буфере будет достаточно данных
      return new Promise<Uint8Array>((resolve, reject) => {
        const check = () => {
          // Если идет процесс сброса, прерываем чтение
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush');
            return reject(new ModbusFlushError());
          }

          // Если в буфере достаточно данных
          if (this.readBuffer.length >= length) {
            // Извлекаем нужное количество байт
            const data = this.readBuffer.slice(0, length);
            // Удаляем прочитанные байты из буфера
            this.readBuffer = this.readBuffer.slice(length);
            logger.debug(`Read ${length} bytes from WebSerial port`);
            return resolve(data);
          }
          // Если время ожидания истекло
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on WebSerial port`);
            return reject(new ModbusTimeoutError('Read timeout'));
          }
          // Если данных недостаточно и время не истекло, планируем следующую проверку
          setTimeout(check, 10);
        };
        // Запускаем первую проверку
        check();
      });
    } finally {
      // Освобождаем блокировку
      release();
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting WebSerial transport...');
    // Отключаем автопереподключение
    this._shouldReconnect = false;
    // Помечаем, что происходит отключение
    this._isDisconnecting = true;

    try {
      // Очищаем таймер реконнекта, если он был
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      // Останавливаем цикл чтения
      this._readLoopActive = false;

      // Очищаем все ресурсы
      this._cleanupResources();

      // Закрываем порт, если он существует
      if (this.port) {
        try {
          logger.debug('Closing port...');
          await (this.port as WebSerialPort).close();
          logger.debug('Port closed successfully.');
        } catch (err: unknown) {
          // Логгируем ошибку закрытия порта, но продолжаем выполнение
          logger.warn(`Error closing port (might be already closed): ${(err as Error).message}`);
        }
        this.port = null;
      }

      // Отклоняем промис подключения, если он существует
      if (this._rejectConnection) {
        this._rejectConnection(new Error('Connection manually disconnected'));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      // Помечаем транспорт как закрытый
      this.isOpen = false;
      logger.info('WebSerial transport disconnected successfully');
    } catch (err: unknown) {
      // Логгируем любую ошибку во время отключения
      logger.error(`Error during WebSerial transport shutdown: ${(err as Error).message}`);
    } finally {
      // В любом случае сбрасываем флаг отключения и закрываем порт
      this._isDisconnecting = false;
      this.isOpen = false;
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }

  async flush(): Promise<void> {
    logger.debug('Flushing WebSerial transport buffer');

    // Если сброс уже идет, ждем его завершения
    if (this._isFlushing) {
      logger.warn('Flush already in progress');
      await Promise.all(this._pendingFlushPromises).catch(() => {});
      return;
    }

    // Помечаем, что начался процесс сброса
    this._isFlushing = true;
    // Создаем промис для отслеживания завершения сброса
    const flushPromise = new Promise<void>(resolve => {
      this._pendingFlushPromises.push(resolve);
    });

    try {
      // Очищаем буфер чтения
      this.readBuffer = allocUint8Array(0);
      // Сбрасываем счетчик пустых чтений
      this._emptyReadCount = 0;
      logger.debug('WebSerial read buffer flushed');
    } finally {
      // В любом случае завершаем процесс сброса
      this._isFlushing = false;
      // Разрешаем все ожидающие промисы
      this._pendingFlushPromises.forEach(resolve => resolve());
      this._pendingFlushPromises = [];
      logger.debug('WebSerial transport flush completed');
    }

    // Возвращаем промис сброса
    return flushPromise;
  }

  private _handleConnectionLoss(reason: string): void {
    // Если порт уже закрыт и не идет подключение, ничего не делаем
    if (!this.isOpen && !this._isConnecting) return;

    logger.warn(`Connection loss detected: ${reason}`);

    // Помечаем порт как закрытый и останавливаем цикл чтения
    this.isOpen = false;
    this._readLoopActive = false;

    // Очищаем все ресурсы
    this._cleanupResources();

    // Если включено автопереподключение и не идет отключение вручную
    if (this._shouldReconnect && !this._isDisconnecting) {
      // Планируем реконнект
      this._scheduleReconnect(new Error(reason));
    }
  }

  private _onError(err: Error): void {
    logger.error(`WebSerial port error: ${err.message}`);
    // Обрабатываем потерю соединения
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  private _onClose(): void {
    logger.info(`WebSerial port closed`);
    // Обрабатываем закрытие порта как потерю соединения
    this._handleConnectionLoss('Port closed');
  }

  private _scheduleReconnect(err: Error): void {
    // Если автопереподключение отключено или идет отключение вручную, не планируем реконнект
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.info('Reconnect disabled or disconnecting, not scheduling');
      return;
    }

    // Очищаем предыдущий таймер реконнекта, если он был
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    // Если достигнуто максимальное количество попыток реконнекта
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for WebSerial port`
      );
      // Отклоняем промис подключения, если он существует
      if (this._rejectConnection) {
        const maxAttemptsError = new Error(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      // Отключаем автопереподключение
      this._shouldReconnect = false;
      return;
    }

    // Увеличиваем счетчик попыток реконнекта
    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect to WebSerial port in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );

    // Устанавливаем таймер для реконнекта
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      // Не вызываем connect() рекурсивно, а делаем реконнект напрямую
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  private async _attemptReconnect(): Promise<void> {
    try {
      // Если порт открыт, пытаемся его закрыть
      if (this.port && this.isOpen) {
        await this._forceCloseCurrentPort();
      }

      // Получаем новый экземпляр порта из фабрики
      this.port = await this.portFactory();
      // Проверяем, что фабрика вернула объект с методом open
      if (!this.port || typeof this.port.open !== 'function') {
        throw new WebSerialConnectionError(
          'Port factory did not return a valid SerialPort object.'
        );
      }

      // Очищаем ресурсы
      this._cleanupResources();

      // Открываем порт
      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as WebSerialPortOptions);

      // Получаем потоки для чтения и записи
      const readable = this.port.readable;
      const writable = this.port.writable;

      // Проверяем, что порт стал доступен для чтения/записи
      if (!readable || !writable) {
        throw new WebSerialConnectionError('Serial port not readable/writable after open');
      }

      // Создаем reader и writer
      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      // Сбрасываем счетчик попыток реконнекта
      this._reconnectAttempts = 0;

      // Запускаем цикл чтения
      this._startReading();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);

      // Разрешаем промис подключения, если он существует
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      // Логгируем ошибку реконнекта
      logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${(err as Error).message}`);
      // Увеличиваем счетчик попыток
      this._reconnectAttempts++;

      // Если можно продолжать реконнект
      if (
        this._shouldReconnect &&
        !this._isDisconnecting &&
        this._reconnectAttempts <= this.options.maxReconnectAttempts
      ) {
        // Планируем следующую попытку реконнекта
        this._scheduleReconnect(err as Error);
      } else {
        // Если реконнект невозможен, отклоняем промис подключения
        if (this._rejectConnection) {
          const maxAttemptsError = new Error(
            `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
          );
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        // Отключаем автопереподключение
        this._shouldReconnect = false;
      }
    }
  }

  destroy(): void {
    logger.info('Destroying WebSerial transport...');
    // Отключаем автопереподключение
    this._shouldReconnect = false;

    // Очищаем таймер реконнекта
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Отклоняем промис подключения
    if (this._rejectConnection) {
      this._rejectConnection(new Error('Transport destroyed'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    // Останавливаем цикл чтения
    this._readLoopActive = false;
    // Очищаем ресурсы
    this._cleanupResources();

    // Закрываем порт, если он существует
    if (this.port) {
      try {
        (this.port as WebSerialPort).close().catch(() => {});
      } catch (err: unknown) {
        logger.debug('Error closing port during destroy:', (err as Error).message);
      }
      this.port = null;
    }

    // Помечаем транспорт как закрытый
    this.isOpen = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
  }
}

export { WebSerialTransport };
