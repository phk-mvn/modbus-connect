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

    this._isFlushing = false;
    this._pendingFlushPromises = [];
    this._operationMutex = new Mutex();
  }

  async connect() {
    return new Promise((resolve, reject) => {
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
          this._scheduleReconnect();
          return reject(err);
        }

        this.isOpen = true;
        this._reconnectAttempts = 0;

        this.port.on('data', this._onData.bind(this));
        this.port.on('error', this._onError.bind(this));
        this.port.on('close', this._onClose.bind(this));

        logger.info(`Serial port ${this.path} opened`);
        resolve();
      });
    });
  }

  _onData(data) {
    const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);

    if (this.readBuffer.length > this.options.maxBufferSize) {
      this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
    }
  }

  _onError(err) {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    this.readBuffer = allocUint8Array(0);
  }

  _onClose() {
    logger.warn(`Serial port ${this.path} closed`);
    this.isOpen = false;
    if (this._shouldReconnect) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts reached for ${this.path}`);
      return;
    }
    this._reconnectAttempts++;
    logger.info(`Reconnecting to ${this.path} in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts})`);
    setTimeout(() => {
      this.connect().catch(err => {
        logger.warn(`Reconnect attempt failed: ${err.message}`);
      });
    }, this.options.reconnectInterval);
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
    if (!this.isOpen) {
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
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush');
            return reject(new ModbusFlushError()); // <-- Прерываем чтение
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
    if (!this.isOpen) return;
    return new Promise((resolve, reject) => {
      this.port.close(err => {
        if (err) {
          logger.error(`Error closing port ${this.path}: ${err.message}`);
          return reject(err);
        }
        this.isOpen = false;
        logger.info(`Serial port ${this.path} closed`);
        resolve();
      });
    });
  }
}

module.exports = { NodeSerialTransport }