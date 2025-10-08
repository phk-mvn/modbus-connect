// transport/web-transports/web-serialport.js

const Logger = require("../../logger.js");
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

const logger = new Logger();
logger.setLevel('info'); // Включаем info уровень

// Настраиваем формат лога
logger.setLogFormat(['timestamp', 'level', 'logger']);
logger.setCustomFormatter('logger', (value) => {
    return value ? `[${value}]` : '';
});

class WebSerialTransport {
  constructor(portFactory, options = {}) {
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
    this._isConnecting = false;
    this._isDisconnecting = false;

    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._reconnectTimer = null;
    this._emptyReadCount = 0;
    this._readLoopActive = false;
    this._readLoopAbortController = null;
    this._operationMutex = new Mutex();
    
    this._connectionPromise = null;
    this._resolveConnection = null;
    this._rejectConnection = null;
  }

  async connect() {
    if (this._isConnecting) {
      logger.warn('Connection attempt already in progress, waiting for it to complete', { logger: 'WebSerialTransport' });
      return this._connectionPromise;
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

      logger.debug('Requesting new SerialPort instance from factory...', { logger: 'WebSerialTransport' });
      
      if (this.port && this.isOpen) {
        logger.warn('Closing existing port before reconnecting', { logger: 'WebSerialTransport' });
        await this._forceCloseCurrentPort();
      }

      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== 'function') {
          throw new Error('Port factory did not return a valid SerialPort object.');
      }
      logger.debug('New SerialPort instance acquired.', { logger: 'WebSerialTransport' });

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
        logger.error(errorMsg, { logger: 'WebSerialTransport' });
        await this._forceCloseCurrentPort();
        throw new Error(errorMsg);
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;

      this._startReading();
      logger.info('WebSerial port opened successfully with new instance', { logger: 'WebSerialTransport' });
      
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      
      return this._connectionPromise;
    } catch (err) {
      logger.error(`Failed to open WebSerial port: ${err.message}`, { logger: 'WebSerialTransport' });
      
      this.isOpen = false;
      
      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        logger.info('Auto-reconnect enabled, starting reconnect process...', { logger: 'WebSerialTransport' });
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

    logger.debug('Force closing current port...', { logger: 'WebSerialTransport' });
    
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
        logger.debug('Error cancelling reader:', err.message, { logger: 'WebSerialTransport' });
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
        await this.writer.close().catch(() => {});
      } catch (err) {
        logger.debug('Error releasing writer:', err.message, { logger: 'WebSerialTransport' });
      }
      this.writer = null;
    }

    if (this.port && this.port.opened) {
      try {
        await this.port.close();
        logger.debug('Port closed successfully', { logger: 'WebSerialTransport' });
      } catch (err) {
        logger.warn(`Error closing port: ${err.message}`, { logger: 'WebSerialTransport' });
      }
    }

    this.port = null;
    this.isOpen = false;
    this.readBuffer = allocUint8Array(0);
  }

  _cleanupResources() {
    logger.debug('Cleaning up WebSerial resources', { logger: 'WebSerialTransport' });
    
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
        logger.debug('Error releasing reader:', e.message, { logger: 'WebSerialTransport' }); 
      }
      this.reader = null;
    }
    
    if (this.writer) {
      try { 
        this.writer.releaseLock(); 
      } catch (e) { 
        logger.debug('Error releasing writer:', e.message, { logger: 'WebSerialTransport' }); 
      }
      this.writer = null;
    }
    
    this.readBuffer = allocUint8Array(0);
    this._readLoopActive = false;
    this._emptyReadCount = 0;
  }

  _startReading() {
    if (!this.isOpen || !this.reader || this._readLoopActive) {
        logger.warn('Cannot start reading: port not open, no reader, or loop already active', { logger: 'WebSerialTransport' });
        return;
    }

    this._readLoopActive = true;
    this._readLoopAbortController = new AbortController();
    logger.debug('Starting read loop', { logger: 'WebSerialTransport' });

    const loop = async () => {
      try {
        while (this.isOpen && this.reader && !this._readLoopAbortController.signal.aborted) {
          try {
            const { value, done } = await this.reader.read();
            
            if (done || this._readLoopAbortController.signal.aborted) {
              logger.warn('WebSerial read stream closed (done=' + done + ')', { logger: 'WebSerialTransport' });
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
                logger.warn(`Too many empty reads (${this._emptyReadCount}), triggering reconnect`, { logger: 'WebSerialTransport' });
                this._emptyReadCount = 0;
                this._readLoopActive = false;
                this._onError(new ModbusTooManyEmptyReadsError());
                break;
              }
            }
          } catch (readErr) {
            if (this._readLoopAbortController.signal.aborted) {
              logger.debug('Read loop aborted', { logger: 'WebSerialTransport' });
              break;
            }
            logger.warn(`Read operation error: ${readErr.message}`, { logger: 'WebSerialTransport' });
            this._readLoopActive = false;
            this._onError(readErr);
            break;
          }
        }
      } catch (loopErr) {
        if (this._readLoopAbortController.signal.aborted) {
          logger.debug('Read loop aborted externally', { logger: 'WebSerialTransport' });
        } else {
          logger.error(`Unexpected error in read loop: ${loopErr.message}`, { logger: 'WebSerialTransport' });
          this._readLoopActive = false;
          this._onError(loopErr);
        }
      } finally {
        this._readLoopActive = false;
        logger.debug('Read loop finished', { logger: 'WebSerialTransport' });
      }
    };
    
    loop().catch(err => {
      logger.error('Read loop promise rejected:', err, { logger: 'WebSerialTransport' });
      this._readLoopActive = false;
      this._onError(err);
    });
  }

  async write(buffer) {
    if (this._isFlushing) {
      logger.debug('Write operation aborted due to ongoing flush', { logger: 'WebSerialTransport' });
      throw new ModbusFlushError();
    }

    if(!this.isOpen || !this.writer){
      logger.warn(`Write attempted on closed/unready port`, { logger: 'WebSerialTransport' });
      throw new Error('Port is closed or not ready for writing');
    }

    const release = await this._operationMutex.acquire();
    try {
      const timeout = this.options.writeTimeout;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);

      try {
        await this.writer.write(buffer, { signal: abort.signal });
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`, { logger: 'WebSerialTransport' });
      } catch (err) {
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`, { logger: 'WebSerialTransport' });
          this._onError(new ModbusTimeoutError('Write timeout'));
          throw new ModbusTimeoutError('Write timeout');
        } else {
          logger.error(`Write error on WebSerial port: ${err.message}`, { logger: 'WebSerialTransport' });
          this._onError(err);
          throw err;
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
      logger.warn('Read attempted on closed port', { logger: 'WebSerialTransport' });
      throw new Error('Port is closed');
    }

    const release = await this._operationMutex.acquire();
    try {
      const start = Date.now();

      return new Promise((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush', { logger: 'WebSerialTransport' });
            return reject(new ModbusFlushError());
          }

          if (this.readBuffer.length >= length) {
            const data = this.readBuffer.slice(0, length);
            this.readBuffer = this.readBuffer.slice(length);
            logger.debug(`Read ${length} bytes from WebSerial port`, { logger: 'WebSerialTransport' });
            return resolve(data);
          }
          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on WebSerial port`, { logger: 'WebSerialTransport' });
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
    logger.info('Disconnecting WebSerial transport...', { logger: 'WebSerialTransport' });
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
          logger.debug('Closing port...', { logger: 'WebSerialTransport' });
          await this.port.close();
          logger.debug('Port closed successfully.', { logger: 'WebSerialTransport' });
        } catch (err) {
          logger.warn(`Error closing port (might be already closed): ${err.message}`, { logger: 'WebSerialTransport' });
        }
        this.port = null;
      }

      if (this._rejectConnection) {
        this._rejectConnection(new Error('Connection manually disconnected'));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      this.isOpen = false;
      logger.info('WebSerial transport disconnected successfully', { logger: 'WebSerialTransport' });

    } catch (err) {
      logger.error(`Error during WebSerial transport shutdown: ${err.message}`, { logger: 'WebSerialTransport' });
    } finally {
      this._isDisconnecting = false;
      this.isOpen = false;
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }

  async flush(){
    logger.debug('Flushing WebSerial transport buffer', { logger: 'WebSerialTransport' });

    if(this._isFlushing){
      logger.warn('Flush already in progress', { logger: 'WebSerialTransport' });
      return Promise.all(this._pendingFlushPromises).catch(() => {});
    }

    this._isFlushing = true;
    const flushPromise = new Promise((resolve) => {
      this._pendingFlushPromises.push(resolve);
    });

    try {
      this.readBuffer = allocUint8Array(0);
      this._emptyReadCount = 0;
      logger.debug('WebSerial read buffer flushed', { logger: 'WebSerialTransport' });
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach((resolve) => resolve());
      this._pendingFlushPromises = [];
      logger.debug('WebSerial transport flush completed', { logger: 'WebSerialTransport' });
    }

    return flushPromise;
  }

  _handleConnectionLoss(reason) {
    if (!this.isOpen && !this._isConnecting) return;

    logger.warn(`Connection loss detected: ${reason}`, { logger: 'WebSerialTransport' });
    
    this.isOpen = false;
    this._readLoopActive = false;

    this._cleanupResources();

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
  }

  _onError(err) {
    logger.error(`WebSerial port error: ${err.message}`, { logger: 'WebSerialTransport' });
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  _onClose() {
    logger.info(`WebSerial port closed`, { logger: 'WebSerialTransport' });
    this._handleConnectionLoss('Port closed');
  }

  _scheduleReconnect(err) {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.info('Reconnect disabled or disconnecting, not scheduling', { logger: 'WebSerialTransport' });
      return;
    }

    if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
    }

    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for WebSerial port`, { logger: 'WebSerialTransport' });
      if (this._rejectConnection) {
        const maxAttemptsError = new Error(`Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;
      return;
    }

    this._reconnectAttempts++;
    logger.info(`Scheduling reconnect to WebSerial port in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`, { logger: 'WebSerialTransport' });

    this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        
        // Не вызываем connect() рекурсивно, а делаем реконнект напрямую
        this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  async _attemptReconnect() {
    try {
      if (this.port && this.isOpen) {
        await this._forceCloseCurrentPort();
      }

      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== 'function') {
          throw new Error('Port factory did not return a valid SerialPort object.');
      }

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
        throw new Error('Serial port not readable/writable after open');
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;

      this._startReading();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`, { logger: 'WebSerialTransport' });
      
      // Разрешаем промис, если он еще существует
      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err) {
      logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${err.message}`, { logger: 'WebSerialTransport' });
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

  destroy() {
    logger.info('Destroying WebSerial transport...', { logger: 'WebSerialTransport' });
    this._shouldReconnect = false;
    
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    
    if (this._rejectConnection) {
      this._rejectConnection(new Error('Transport destroyed'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }
    
    this._readLoopActive = false;
    this._cleanupResources();
    
    if (this.port) {
      try {
        this.port.close().catch(() => {});
      } catch (err) {
        logger.debug('Error closing port during destroy:', err.message, { logger: 'WebSerialTransport' });
      }
      this.port = null;
    }
    
    this.isOpen = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
  }
}

module.exports = { WebSerialTransport }