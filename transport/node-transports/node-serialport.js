// transport/node-transports/node-serialport.js

const { SerialPort } = require("serialport");
const { Mutex } = require('async-mutex');
const {
  concatUint8Arrays,
  sliceUint8Array,
  allocUint8Array,
  isUint8Array
} = require('../../utils/utils.js');
const logger = require('../../logger.js');

const {
  ModbusError,
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTooManyEmptyReadsError,
  ModbusExceptionError,
  ModbusFlushError
} = require('../../errors.js');

class NodeSerialTransport {
  constructor(port, options = {}) {
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
      ...options
    };
    this.port = null;
    this.readBuffer = allocUint8Array(0);
    this.isOpen = false;
    this._reconnectAttempts = 0;
    this._shouldReconnect = true;
    this._reconnectTimeout = null;
    
    // Флаг для отслеживания состояния подключения
    this._isConnecting = false;
    this._isDisconnecting = false;

    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._operationMutex = new Mutex();
    
    // Добавляем промис для ожидания успешного подключения
    this._connectionPromise = null;
    this._resolveConnection = null;
    this._rejectConnection = null;
  }

  async connect() {
    // Если максимальное количество попыток достигнуто, сразу бросаем ошибку
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new Error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
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
          this.port.close((err) => {
            if (err) {
              logger.warn(`Error closing existing port: ${err.message}`);
            }
            resolve();
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
    } catch (err) {
      logger.error(`Failed to open serial port ${this.path}: ${err.message}`);
      
      this.isOpen = false;
      
      // Если достигнуто максимальное количество попыток, отклоняем промис
      if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
        const maxAttemptsError = new Error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
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
        this._scheduleReconnect(err);
        
        // Возвращаем промис, чтобы вызывающий код ждал результат реконнекта
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

  _createAndOpenPort() {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.path,
          baudRate: this.options.baudRate,
          dataBits: this.options.dataBits,
          stopBits: this.options.stopBits,
          parity: this.options.parity,
          autoOpen: false
        });

        this.port.open(err => {
          if (err) {
            logger.error(`Failed to open serial port ${this.path}: ${err.message}`);
            this.isOpen = false;
            return reject(err);
          }

          this.isOpen = true;
          this._reconnectAttempts = 0;

          // Удаляем старые обработчики, если они есть
          this._removeAllListeners();
          
          // Добавляем новые обработчики
          this.port.on('data', this._onData.bind(this));
          this.port.on('error', this._onError.bind(this));
          this.port.on('close', this._onClose.bind(this));

          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  _removeAllListeners() {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }

  _onData(data) {
    // Проверяем, что порт все еще открыт
    if (!this.isOpen) return;
    
    const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);

    if (this.readBuffer.length > this.options.maxBufferSize) {
      this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
    }
  }

  _onError(err) {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    this.readBuffer = allocUint8Array(0);
    // Порт может быть уже закрыт, но если нет - закрываем
    if (this.isOpen) {
      this.isOpen = false;
      this._removeAllListeners();
    }
  }

  _onClose() {
    logger.warn(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._removeAllListeners();
    
    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error('Port closed'));
    }
  }

  _scheduleReconnect(err) {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.info('Reconnect disabled or disconnecting, not scheduling');
      return;
    }

    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }

    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for ${this.path}`);
      // Отклоняем промис, если достигнуто максимальное количество попыток
      if (this._rejectConnection) {
        const maxAttemptsError = new Error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      // Останавливаем реконнект
      this._shouldReconnect = false;
      return;
    }

    this._reconnectAttempts++;
    logger.info(`Scheduling reconnect to ${this.path} in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`);
    
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      // Делаем реконнект напрямую, без рекурсивного вызова connect()
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  async _attemptReconnect() {
    try {
      if (this.port && this.port.isOpen) {
        await new Promise((resolve) => {
          this.port.close(() => resolve());
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
    } catch (err) {
      logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${err.message}`);
      this._reconnectAttempts++;
      
      if (this._shouldReconnect && !this._isDisconnecting && this._reconnectAttempts <= this.options.maxReconnectAttempts) {
        this._scheduleReconnect(err);
      } else {
        if (this._rejectConnection) {
          const maxAttemptsError = new Error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;
      }
    }
  }

  async flush(){
    logger.debug('Flushing NodeSerial transport buffer')
    if(this._isFlushing){
      logger.warn('Flush already in progress')
      return Promise.all(this._pendingFlushPromises).catch(() => {})
    }

    this._isFlushing = true
    const flushPromise = new Promise((resolve) => {
      this._pendingFlushPromises.push(resolve)
    })

    try {
      this.readBuffer = allocUint8Array(0)
      logger.debug('NodeSerial read buffer flushed')
    } finally {
      this._isFlushing = false
      this._pendingFlushPromises.forEach((resolve) => resolve())
      this._pendingFlushPromises = []
      logger.debug('NodeSerial transport flush completed')
    }

    return flushPromise
  }

  async write(buffer) {
    if (!this.isOpen || !this.port || !this.port.isOpen) {
      logger.warn(`Write attempted on closed port ${this.path}`);
      throw new Error('Port is closed');
    }

    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        this.port.write(buffer, err => {
          if (err) {
            logger.error(`Write error on port ${this.path}: ${err.message}`);
            return reject(err);
          }
          this.port.drain(drainErr => {
            if (drainErr) {
              logger.error(`Drain error on port ${this.path}: ${drainErr.message}`);
              return reject(drainErr);
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
    const start = Date.now();

    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        const checkData = () => {
          if (!this.isOpen || !this.port || !this.port.isOpen) {
            logger.warn('Read operation interrupted: port is not open');
            return reject(new Error('Port is closed'));
          }
          
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush');
            return reject(new ModbusFlushError());
          }

          if (this.readBuffer.length >= length) {
            const data = sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = sliceUint8Array(this.readBuffer, length);
            logger.debug(`Read ${length} bytes from ${this.path}`);
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on ${this.path}`);
            return reject(new Error('Read timeout'));
          }
          setTimeout(checkData, 10);
        };
        checkData();
      });
    } finally {
      release();
    }
  }

  async disconnect() {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    
    // Очищаем таймаут реконнекта
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }

    // Отклоняем промис подключения при отключении
    if (this._rejectConnection) {
      this._rejectConnection(new Error('Connection manually disconnected'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    // Если порт уже закрыт, просто возвращаем
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Удаляем все обработчики событий
      this._removeAllListeners();
      
      this.port.close(err => {
        this._isDisconnecting = false;
        this.isOpen = false;
        
        if (err) {
          logger.error(`Error closing port ${this.path}: ${err.message}`);
          return reject(err);
        }
        
        logger.info(`Serial port ${this.path} closed`);
        resolve();
      });
    });
  }

  // Дополнительный метод для принудительной очистки
  destroy() {
    this._shouldReconnect = false;
    
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    
    // Отклоняем промис при уничтожении
    if (this._rejectConnection) {
      this._rejectConnection(new Error('Transport destroyed'));
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
        logger.error(`Error destroying port ${this.path}: ${err.message}`);
      }
    }
    
    this.isOpen = false;
    this.port = null;
  }
}

module.exports = { NodeSerialTransport };