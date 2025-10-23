// src/transport/web-transports/web-serialport.ts

import Logger from '../../logger.js';
import { allocUint8Array } from '../../utils/utils.js';
import { Mutex } from 'async-mutex';

import {
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
  ModbusFlushError,
  WebSerialTransportError,
  WebSerialConnectionError,
  WebSerialReadError,
  WebSerialWriteError,
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
} from '../../errors.js';

import {
  Transport,
  WebSerialPort,
  WebSerialPortOptions,
  WebSerialTransportOptions,
} from '../../types/modbus-types.js';

const WEB_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  MAX_READ_BUFFER_SIZE: 65536,
  POLL_INTERVAL_MS: 10,
  VALID_BAUD_RATES: [300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const,
} as const;

const loggerInstance = new Logger();
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', value => {
  return value ? `[${value}]` : '';
});
const logger = loggerInstance.createLogger('WebSerialTransport');
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
  [ModbusTooManyEmptyReadsError.name]: () => logger.error('Too many empty reads error detected'),
  [ModbusFlushError.name]: () => logger.error('Flush error detected'),
  [WebSerialTransportError.name]: () => logger.error('WebSerial transport error detected'),
  [WebSerialConnectionError.name]: () => logger.error('WebSerial connection error detected'),
  [WebSerialReadError.name]: () => logger.error('WebSerial read error detected'),
  [WebSerialWriteError.name]: () => logger.error('WebSerial write error detected'),
};

const handleModbusError = (err: Error): void => {
  ERROR_HANDLERS[err.constructor.name]?.() || logger.error(`Unknown error: ${err.message}`);
};

interface DeviceConnectionStateObject {
  slaveId: number;
  hasConnectionDevice: boolean;
  errorType?: string;
  errorMessage?: string;
}

type DeviceConnectionListener = (state: DeviceConnectionStateObject) => void;

class WebSerialTransport implements Transport {
  private portFactory: () => Promise<WebSerialPort>;
  private port: WebSerialPort | null = null;
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

  private _deviceConnectionListeners: DeviceConnectionListener[] = [];
  private _deviceStates: Map<number, DeviceConnectionStateObject> = new Map();

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

  addDeviceConnectionListener(listener: DeviceConnectionListener): void {
    this._deviceConnectionListeners.push(listener);
    for (const state of this._deviceStates.values()) {
      listener(state);
    }
  }

  removeDeviceConnectionListener(listener: DeviceConnectionListener): void {
    const index = this._deviceConnectionListeners.indexOf(listener);
    if (index !== -1) {
      this._deviceConnectionListeners.splice(index, 1);
    }
  }

  private _notifyDeviceConnectionListeners(
    slaveId: number,
    state: DeviceConnectionStateObject
  ): void {
    this._deviceStates.set(slaveId, state);
    logger.debug(`Device connection state changed for slaveId ${slaveId}:`, state);

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

  notifyDeviceConnected(slaveId: number): void {
    const currentState = this._deviceStates.get(slaveId);
    if (!currentState || !currentState.hasConnectionDevice) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, true));
    }
  }

  notifyDeviceDisconnected(slaveId: number, errorType?: string, errorMessage?: string): void {
    this._notifyDeviceConnectionListeners(
      slaveId,
      this._createState(slaveId, false, errorType, errorMessage)
    );
  }

  private async _releaseAllResources(hardClose = false): Promise<void> {
    logger.debug('Releasing WebSerial resources');

    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (err: unknown) {
        logger.debug('Error cancelling reader:', (err as Error).message);
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
        await this.writer.close().catch(() => {});
      } catch (err: unknown) {
        logger.debug('Error releasing writer:', (err as Error).message);
      }
      this.writer = null;
    }

    if (hardClose && this.port) {
      try {
        await this.port.close();
        logger.debug('Port closed successfully');
      } catch (err: unknown) {
        logger.warn(`Error closing port: ${(err as Error).message}`);
      }
      this.port = null;
    }

    this.isOpen = false;
    this.readBuffer = allocUint8Array(0);
    this._emptyReadCount = 0;
  }

  async connect(): Promise<void> {
    if (this._isConnecting) {
      logger.warn('Connection attempt already in progress, waiting for it to complete');
      if (this._connectionPromise) {
        return this._connectionPromise;
      }
      return Promise.resolve();
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

      logger.debug('Requesting new SerialPort instance from factory...');

      if (this.port && this.isOpen) {
        logger.debug('Closing existing port before reconnecting');
        await this._releaseAllResources(true);
      }

      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== 'function') {
        throw new WebSerialConnectionError(
          'Port factory did not return a valid SerialPort object.'
        );
      }
      logger.debug('New SerialPort instance acquired.');

      if (
        this.options.baudRate < WEB_SERIAL_CONSTANTS.MIN_BAUD_RATE ||
        this.options.baudRate > WEB_SERIAL_CONSTANTS.MAX_BAUD_RATE
      ) {
        throw new ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }

      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as WebSerialPortOptions);

      const readable = this.port.readable;
      const writable = this.port.writable;

      if (!readable || !writable) {
        const errorMsg = 'Serial port not readable/writable after open';
        logger.error(errorMsg);
        await this._releaseAllResources(true);
        throw new WebSerialConnectionError(errorMsg);
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;

      this._startReading();
      logger.info('WebSerial port opened successfully with new instance');

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      return this._connectionPromise;
    } catch (err: unknown) {
      logger.error(`Failed to open WebSerial port: ${(err as Error).message}`);

      this.isOpen = false;

      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        logger.info('Auto-reconnect enabled, starting reconnect process...');
        this._scheduleReconnect(err as Error);
        return this._connectionPromise;
      } else {
        if (this._rejectConnection) {
          this._rejectConnection(err as Error);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw err;
      }
    } finally {
      this._isConnecting = false;
    }
  }

  private _startReading(): void {
    if (!this.isOpen || !this.reader || this._readLoopActive) {
      logger.warn('Cannot start reading: port not open, no reader, or loop already active');
      return;
    }

    this._readLoopActive = true;
    this._readLoopAbortController = new AbortController();
    logger.debug('Starting read loop');

    const loop = async (): Promise<void> => {
      try {
        while (
          this.isOpen &&
          this.reader &&
          this._readLoopAbortController &&
          !this._readLoopAbortController.signal.aborted
        ) {
          try {
            const { value, done } = await this.reader.read();

            if (done || this._readLoopAbortController.signal.aborted) {
              logger.warn('WebSerial read stream closed (done=' + done + ')');
              this._readLoopActive = false;
              this._onClose();
              break;
            }

            if (value && value.length > 0) {
              this._emptyReadCount = 0;

              if (
                this.readBuffer.length + value.length >
                WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE
              ) {
                logger.error('Buffer overflow detected');
                throw new ModbusBufferOverflowError(
                  this.readBuffer.length + value.length,
                  WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE
                );
              }

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
          } catch (readErr: unknown) {
            if (this._readLoopAbortController.signal.aborted) {
              logger.debug('Read loop aborted');
              break;
            }

            const error = readErr as Error;
            logger.warn(`Read operation error: ${error.message}`);

            if (error.message.includes('parity') || error.message.includes('Parity')) {
              this._onError(new ModbusParityError(error.message));
            } else if (error.message.includes('frame') || error.message.includes('Framing')) {
              this._onError(new ModbusFramingError(error.message));
            } else if (error.message.includes('overrun')) {
              this._onError(new ModbusOverrunError(error.message));
            } else if (error.message.includes('collision')) {
              this._onError(new ModbusCollisionError(error.message));
            } else if (error.message.includes('noise')) {
              this._onError(new ModbusNoiseError(error.message));
            } else {
              this._onError(new WebSerialReadError(error.message));
            }
            break;
          }
        }
      } catch (loopErr: unknown) {
        if (this._readLoopAbortController?.signal.aborted) {
          logger.debug('Read loop aborted externally');
        } else {
          logger.error(`Unexpected error in read loop: ${(loopErr as Error).message}`);
          this._readLoopActive = false;

          if ((loopErr as Error).message.includes('stack')) {
            this._onError(new ModbusStackOverflowError((loopErr as Error).message));
          } else {
            this._onError(loopErr as Error);
          }
        }
      } finally {
        this._readLoopActive = false;
        logger.debug('Read loop finished');
      }
    };

    loop().catch(err => {
      logger.error('Read loop promise rejected:', err);
      this._readLoopActive = false;

      if ((err as Error).message.includes('memory')) {
        this._onError(new ModbusMemoryError((err as Error).message));
      } else {
        this._onError(err as Error);
      }
    });
  }

  async write(buffer: Uint8Array): Promise<void> {
    if (this._isFlushing) {
      logger.debug('Write operation aborted due to ongoing flush');
      throw new ModbusFlushError();
    }

    if (!this.isOpen || !this.writer) {
      logger.warn(`Write attempted on closed/unready port`);
      throw new WebSerialWriteError('Port is closed or not ready for writing');
    }

    if (buffer.length === 0) {
      throw new ModbusBufferUnderrunError(0, 1);
    }

    const release = await this._operationMutex.acquire();
    try {
      const timeout = this.options.writeTimeout;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);

      try {
        await this.writer.write(buffer);
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`);
      } catch (err: unknown) {
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`);
          const timeoutError = new ModbusTimeoutError('Write timeout');
          this._onError(timeoutError);
          throw timeoutError;
        } else {
          logger.error(`Write error on WebSerial port: ${(err as Error).message}`);

          if ((err as Error).message.includes('parity')) {
            this._onError(new ModbusParityError((err as Error).message));
            throw new ModbusParityError((err as Error).message);
          } else if ((err as Error).message.includes('collision')) {
            this._onError(new ModbusCollisionError((err as Error).message));
            throw new ModbusCollisionError((err as Error).message);
          } else {
            this._onError(new WebSerialWriteError((err as Error).message));
            throw err;
          }
        }
      } finally {
        clearTimeout(timer);
        abort.abort();
      }
    } finally {
      release();
    }
  }

  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    if (!this.isOpen) {
      logger.warn('Read attempted on closed port');
      throw new WebSerialReadError('Port is closed');
    }

    if (length <= 0) {
      throw new ModbusDataConversionError(length, 'positive integer');
    }

    const release = await this._operationMutex.acquire();
    let emptyReadAttempts = 0;
    try {
      const start = Date.now();

      return new Promise<Uint8Array>((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) {
            logger.debug('Read operation interrupted by flush');
            return reject(new ModbusFlushError());
          }

          if (this.readBuffer.length >= length) {
            const data = this.readBuffer.slice(0, length);
            this.readBuffer = this.readBuffer.slice(length);
            logger.debug(`Read ${length} bytes from WebSerial port`);
            emptyReadAttempts = 0;

            if (data.length !== length) {
              return reject(new ModbusInsufficientDataError(data.length, length));
            }

            return resolve(data);
          }

          if (this.readBuffer.length === 0) {
            emptyReadAttempts++;
            if (emptyReadAttempts >= 3) {
              logger.debug('Scheduling auto-reconnect - 3 empty reads detected', {
                timeout,
                emptyAttempts: emptyReadAttempts,
              });
              emptyReadAttempts = 0;

              this._scheduleReconnect(new ModbusTooManyEmptyReadsError('3 empty reads in read()'));
            }
          } else {
            emptyReadAttempts = 0;
          }

          if (Date.now() - start > timeout) {
            logger.warn(`Read timeout on WebSerial port`);
            this.flush().catch(() => {});
            return reject(new ModbusTimeoutError('Read timeout'));
          }

          setTimeout(check, WEB_SERIAL_CONSTANTS.POLL_INTERVAL_MS);
        };
        check();
      });
    } finally {
      release();
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting WebSerial transport...');
    this._shouldReconnect = false;
    this._isDisconnecting = true;

    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      await this._releaseAllResources(true);

      if (this._rejectConnection) {
        this._rejectConnection(new WebSerialConnectionError('Connection manually disconnected'));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
      }
      this._deviceStates.clear();

      logger.info('WebSerial transport disconnected successfully');
    } catch (err: unknown) {
      logger.error(`Error during WebSerial transport shutdown: ${(err as Error).message}`);
    } finally {
      this._isDisconnecting = false;
      this.isOpen = false;
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }

  async flush(): Promise<void> {
    logger.debug('Flushing WebSerial transport buffer');

    if (this._isFlushing) {
      logger.warn('Flush already in progress');
      await Promise.all(this._pendingFlushPromises).catch(() => {});
      return;
    }

    this._isFlushing = true;
    const flushPromise = new Promise<void>(resolve => {
      this._pendingFlushPromises.push(resolve);
    });

    try {
      this.readBuffer = allocUint8Array(0);
      this._emptyReadCount = 0;
      logger.debug('WebSerial read buffer flushed');
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach(resolve => resolve());
      this._pendingFlushPromises = [];
      logger.debug('WebSerial transport flush completed');
    }

    return flushPromise;
  }

  private _onError(err: Error): void {
    handleModbusError(err);
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

    logger.warn(`Connection loss detected: ${reason}`);

    this.isOpen = false;
    this._readLoopActive = false;

    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
  }

  private _onClose(): void {
    logger.info(`WebSerial port closed`);

    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();

    this._handleConnectionLoss('Port closed');
  }

  private _scheduleReconnect(err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) {
      logger.info('Reconnect disabled or disconnecting, not scheduling');
      return;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for WebSerial port`
      );
      const maxAttemptsError = new WebSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      if (this._rejectConnection) {
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;

      for (const [slaveId] of this._deviceStates) {
        this._notifyDeviceConnectionListeners(
          slaveId,
          this._createState(slaveId, false, 'MaxReconnectAttemptsReached', maxAttemptsError.message)
        );
      }

      return;
    }

    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect to WebSerial port in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  private async _attemptReconnect(): Promise<void> {
    try {
      if (this.port && this.isOpen) {
        await this._releaseAllResources(true);
      }

      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== 'function') {
        throw new WebSerialConnectionError(
          'Port factory did not return a valid SerialPort object.'
        );
      }

      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as WebSerialPortOptions);

      const readable = this.port.readable;
      const writable = this.port.writable;

      if (!readable || !writable) {
        throw new WebSerialConnectionError('Serial port not readable/writable after open');
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._reconnectAttempts = 0;

      this._startReading();
      logger.info(`Reconnect attempt ${this._reconnectAttempts} successful`);

      this._deviceStates.clear();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      logger.warn(`Reconnect attempt ${this._reconnectAttempts} failed: ${(err as Error).message}`);
      this._reconnectAttempts++;

      if (
        this._shouldReconnect &&
        !this._isDisconnecting &&
        this._reconnectAttempts <= this.options.maxReconnectAttempts
      ) {
        this._scheduleReconnect(err as Error);
      } else {
        const maxAttemptsError = new WebSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        if (this._rejectConnection) {
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;

        for (const [slaveId] of this._deviceStates) {
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
      }
    }
  }

  destroy(): void {
    logger.info('Destroying WebSerial transport...');
    this._shouldReconnect = false;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._rejectConnection) {
      this._rejectConnection(new WebSerialTransportError('Transport destroyed'));
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    this._readLoopActive = false;
    this._releaseAllResources(true).catch(() => {});

    for (const [slaveId] of this._deviceStates) {
      this._notifyDeviceConnectionListeners(slaveId, this._createState(slaveId, false));
    }
    this._deviceStates.clear();

    this.isOpen = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
  }
}

export = WebSerialTransport;
