// transport/web-transports/web-serialport.js

const logger = require("../../logger.js");
const { allocUint8Array } = require("../../utils/utils.js");
const { Mutex } = require('async-mutex');

const {
  ModbusError,
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTooManyEmptyReadsError,
  ModbusExceptionError,
  ModbusFlushError
} = require('../../errors.js')

class WebSerialTransport {
  constructor(portFactory, options = {}) {
    // <-- Изменение 1: Проверка входных данных -->
    if(typeof portFactory !== 'function'){
      throw new Error('A port factory function must be provided to WebSerialTransport')
    }
    this.portFactory = portFactory
    this.port = null;
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
      ...options
    };
    this.reader = null;
    this.writer = null;
    this.readBuffer = new Uint8Array(0);

    this.isOpen = false;
    this._reconnectAttempts = 0;
    this._shouldReconnect = true;

    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._reconnectTimer = null;
    this._emptyReadCount = 0;
    this._readLoopActive = false;
    this._operationMutex = new Mutex();
  }

  async connect() {
    // <-- Изменение 4: Очистка таймера при начале новой попытки подключения -->
    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }

    try {
      this._shouldReconnect = true;
      this._emptyReadCount = 0;

      // <-- Изменение 5: Всегда получаем новый порт через фабрику -->
      // Это ключевой момент: мы больше не пытаемся переиспользовать "сломанный" объект
      logger.debug('Requesting new SerialPort instance from factory...');
      this.port = await this.portFactory(); // <-- Получаем новый порт
      if (!this.port || typeof this.port.open !== 'function') {
          throw new Error('Port factory did not return a valid SerialPort object.');
      }
      logger.debug('New SerialPort instance acquired.');

      // <-- Изменение 3: Принудительная очистка перед открытием нового порта -->
      // На случай, если portFactory вернула существующий порт, который нужно "починить"
      if (this.port) {
        // Отменяем reader, если активен (на случай, если _cleanupResources не сработал полностью)
        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch (cancelErr) {
                logger.debug('Error cancelling reader during pre-connect (new port):', cancelErr.message);
            }
            try {
                this.reader.releaseLock();
            } catch (releaseErr) {
                logger.debug('Error releasing reader lock during pre-connect (new port):', releaseErr.message);
            }
            this.reader = null;
        }
        // Освобождаем writer, если активен
        if (this.writer) {
            try {
                this.writer.releaseLock();
            } catch (releaseErr) {
                logger.debug('Error releasing writer lock during pre-connect (new port):', releaseErr.message);
            }
            this.writer = null;
        }
        
        // Пытаемся закрыть порт, если он "открыт" 
        // Это помогает сбросить состояние браузера, если порт "завис".
        // ВАЖНО: Сбрасываем isOpen до вызова close(), чтобы избежать рекурсии через _onError
        const wasOpen = this.isOpen;
        this.isOpen = false; 
        this.readBuffer = allocUint8Array(0);
        
        if (wasOpen) { // Только если мы думали, что он открыт
            try {
                logger.debug('Attempting to close the port (from factory) before reopening...');
                await this.port.close();
                logger.debug('Port (from factory) closed successfully before reconnecting.');
            } catch (closeErr) {
                // Ошибка закрытия может возникнуть, если порт уже закрыт или в некорректном состоянии.
                logger.debug('Error closing port (from factory) before reconnect (might be already closed or broken):', closeErr.message);
                // Игнорируем ошибку закрытия, цель - сброс состояния.
            }
        }
        // --- Конец изменения 3 ---
      }
      // <-- Конец изменения 5 -->

      // <-- Изменение 6: Убедиться, что предыдущие ресурсы освобождены -->
      // Хотя порт новый, всё равно сделаем очистку на всякий случай
      this._cleanupResources();

      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      });

      const readable = this.port.readable;
      const writable = this.port.writable;

      if (!readable || !writable) {
        const errorMsg = 'Serial port not readable/writable after open';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;

      this._startReading();
      logger.info('WebSerial port opened successfully with new instance');
    } catch (err) {
      logger.error(`Failed to open WebSerial port: ${err.message}`);
      
      // <-- Изменение 7: Упрощенная обработка ошибок -->
      // Больше не пытаемся различать типы ошибок открытия для остановки реконнекта
      // Если фабрика даёт новый порт, ошибка "already open" должна исчезнуть
      if (this._shouldReconnect) {
         this._scheduleReconnect(err);
      }
      throw err;
    }
  }

  // <-- Изменение 8: Централизованная функция очистки ресурсов -->
  _cleanupResources() {
      if (this.reader) {
          try { this.reader.releaseLock(); } catch (e) { logger.debug('Error releasing reader:', e.message); }
          this.reader = null;
      }
      if (this.writer) {
          try { this.writer.releaseLock(); } catch (e) { logger.debug('Error releasing writer:', e.message); }
          this.writer = null;
      }
      // Не закрываем this.port здесь, это делается в disconnect или перед новым открытием
      this.readBuffer = allocUint8Array(0);
      this._readLoopActive = false;
      this._emptyReadCount = 0;
  }

  _startReading() {
    if (!this.isOpen || !this.reader || this._readLoopActive) {
        logger.warn('Cannot start reading: port not open, no reader, or loop already active');
        return;
    }

    this._readLoopActive = true;
    logger.debug('Starting read loop');

    const loop = async () => {
      try {
        while (this.isOpen && this.reader) {
          try {
            const { value, done } = await this.reader.read();
            
            if (done) {
              logger.warn('WebSerial read stream closed (done=true)');
              this._readLoopActive = false;
              this._onClose();
              break;
            }
            
            if (value && value.length > 0) {
              this._emptyReadCount = 0;
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
                this._onError(new ModbusTooManyEmptyReadsError());
                break;
              }
            }
          } catch (readErr) {
            logger.warn(`Read operation error: ${readErr.message}`);
            this._readLoopActive = false;
            this._onError(readErr);
            break;
          }
        }
      } catch (loopErr) {
        logger.error(`Unexpected error in read loop: ${loopErr.message}`);
        this._readLoopActive = false;
        this._onError(loopErr);
      } finally {
        this._readLoopActive = false;
        logger.debug('Read loop finished');
      }
    };
    loop();
  }

  async write(buffer) {
    const release = await this._operationMutex.acquire();
    try {
      if (this._isFlushing) {
        logger.debug('Write operation aborted due to ongoing flush');
        throw new ModbusFlushError();
      }

      if(!this.isOpen || !this.writer){
        logger.warn(`Write attempted on closed/unready port`);
        throw new Error('Port is closed or not ready for writing');
      }

      const timeout = this.options.writeTimeout;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);

      try {
        await this.writer.write(buffer, { signal: abort.signal });
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`);
      } catch (err) {
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`);
          this._onError(new ModbusTimeoutError('Write timeout'));
          throw new ModbusTimeoutError('Write timeout');
      } else {
          logger.error(`Write error on WebSerial port: ${err.message}`);
          this._onError(err);
          throw err;
      }
      } finally {
        clearTimeout(timer);
      }
    } finally {
      release();
    }
  }

  async read(length, timeout = this.options.readTimeout) {
    const release = await this._operationMutex.acquire();
    try {
      const start = Date.now();

      return new Promise((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush');
            return reject(new ModbusFlushError());
          }

          if (this.readBuffer.length >= length) {
            const data = this.readBuffer.slice(0, length);
            this.readBuffer = this.readBuffer.slice(length);
            logger.debug(`Read ${length} bytes from WebSerial port`);
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on WebSerial port`);
            return reject(new ModbusTimeoutError('Read timeout'));
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
    logger.info('Disconnecting WebSerial transport...');
    this._shouldReconnect = false;

    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
    }

    this._readLoopActive = false;

    try {
      // <-- Изменение 9: Используем централизованную очистку -->
      this._cleanupResources();

      // <-- Изменение 10: Закрываем порт и сбрасываем его -->
      if (this.port) {
        try {
          logger.debug('Closing port...');
          await this.port.close();
          logger.debug('Port closed successfully.');
        } catch (err) {
          // Ошибка закрытия может произойти, если порт уже закрыт или в некорректном состоянии
          logger.warn(`Error closing port (might be already closed): ${err.message}`);
        }
        this.port = null; // <-- ВАЖНО: Сбрасываем ссылку на порт
     }

     this.isOpen = false;
     logger.info('WebSerial transport disconnected successfully');

    } catch (err) {
      logger.error(`Error during WebSerial transport shutdown: ${err.message}`);
      // Даже если ошибка, всё равно сбрасываем состояние
      this.isOpen = false;
      this.port = null; // <-- ВАЖНО: Сбрасываем ссылку на порт
      this.reader = null;
      this.writer = null;
    }
  }

  async flush(){
    logger.debug('Flushing WebSerial transport buffer');

    if(this._isFlushing){
      logger.warn('Flush already in progress');
      return Promise.all(this._pendingFlushPromises).catch(() => {});
    }

    this._isFlushing = true;
    const flushPromise = new Promise((resolve) => {
      this._pendingFlushPromises.push(resolve);
    });

    try {
      this.readBuffer = allocUint8Array(0);
      this._emptyReadCount = 0;
      logger.debug('WebSerial read buffer flushed');
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach((resolve) => resolve());
      this._pendingFlushPromises = [];
      logger.debug('WebSerial transport flush completed');
    }

    return flushPromise;
  }

  // ? ===========================================
  // ? ========== МЕТОДЫ ДЛЯ РЕКОННЕКТА ==========
  // ? ===========================================
  
  // <-- Изменение 48: Универсальный метод для обработки ошибок и закрытия -->
  _handleConnectionLoss(reason) {
    if (!this.isOpen) return;

    logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;
    this._readLoopActive = false;

    // <-- Изменение 11: Используем централизованную очистку -->
    this._cleanupResources();

    // <-- Изменение 12: Не пытаемся закрыть this.port здесь -->
    // Порт будет закрыт и сброшен в connect() или disconnect()

    if (this._shouldReconnect) {
      this._scheduleReconnect(new Error(reason));
    }
  }

  _onError(err) {
    logger.error(`WebSerial port error: ${err.message}`);
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  _onClose() {
    logger.warn(`WebSerial port closed`);
    this._handleConnectionLoss('Port closed');
  }

  _scheduleReconnect(err) {
    if (!this._shouldReconnect) {
      logger.info('Reconnect disabled, not scheduling');
      return;
    }

    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
    }

    if (this._reconnectAttempts >= (this.options.maxReconnectAttempts || Infinity)) {
      logger.error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for WebSerial port`);
      return;
    }

    this._reconnectAttempts++;
    logger.info(`Scheduling reconnect to WebSerial port in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`);

    this._reconnectTimer = setTimeout(async () => {
        this._reconnectTimer = null;

        try {
            await this.connect(); // <-- connect() теперь получит НОВЫЙ порт
            logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);
            this._reconnectAttempts = 0;
            this._emptyReadCount = 0;

        } catch (reconnectErr) {
            logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${reconnectErr.message}`);

            // <-- Изменение 13: Упрощённая логика планирования -->
            // Просто планируем следующую попытку, если разрешено
            if (this._shouldReconnect) {
               this._scheduleReconnect(reconnectErr);
            }
        }
    }, this.options.reconnectInterval);
  }
}

module.exports = { WebSerialTransport }