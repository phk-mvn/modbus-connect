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
  DeviceStateHandler,
  ConnectionErrorType,
  PortStateHandler,
  RSMode,
} from '../../types/modbus-types.js';

const WEB_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  MAX_READ_BUFFER_SIZE: 65536,
  POLL_INTERVAL_MS: 10,
} as const;

const loggerInstance = new Logger();
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', value => (value ? `[${value}]` : ''));
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
  const handler = ERROR_HANDLERS[err.constructor.name];
  if (handler) {
    handler();
  } else {
    logger.error(`Unknown error: ${err.message}`);
  }
};

class WebSerialTransport implements Transport {
  public isOpen: boolean = false;

  private portFactory: () => Promise<WebSerialPort>;
  private port: WebSerialPort | null = null;
  private options: Required<WebSerialTransportOptions>;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer: Uint8Array;

  private _connectedSlaveIds: Set<number> = new Set();

  private _isPortReady: boolean = false;
  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;

  private _isFlushing: boolean = false;
  private _pendingFlushPromises: Array<() => void> = [];
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _emptyReadCount: number = 0;
  private _readLoopActive: boolean = false;
  private _readLoopAbortController: AbortController | null = null;
  private _operationMutex: Mutex;

  private _connectionPromise: Promise<void> | null = null;
  private _resolveConnection: (() => void) | null = null;
  private _rejectConnection: ((reason?: Error | string | null) => void) | null = null;

  private _portClosePromise: Promise<void> | null = null;
  private _portCloseResolve: (() => void) | null = null;

  private _deviceStateHandler: DeviceStateHandler | null = null;
  private _portStateHandler: PortStateHandler | null = null;

  private _wasEverConnected: boolean = false;

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
      RSMode: options.RSMode || 'RS485',
      ...options,
    };
    this.readBuffer = new Uint8Array(0);
    this._operationMutex = new Mutex();
  }

  public getRSMode(): RSMode {
    return this.options.RSMode;
  }

  public setDeviceStateHandler(handler: DeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  public setPortStateHandler(handler: PortStateHandler): void {
    this._portStateHandler = handler;
  }

  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
    logger.debug('Device connection tracking disabled');
  }

  public async enableDeviceTracking(handler?: DeviceStateHandler): Promise<void> {
    if (handler) {
      this._deviceStateHandler = handler;
    }
    logger.debug('Device connection tracking enabled');
  }

  public notifyDeviceConnected(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) {
      return;
    }
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, true);
    }
  }

  public notifyDeviceDisconnected(
    slaveId: number,
    errorType: ConnectionErrorType,
    errorMessage: string
  ): void {
    if (!this._connectedSlaveIds.has(slaveId)) {
      return;
    }
    this._connectedSlaveIds.delete(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, false, { type: errorType, message: errorMessage });
    }
  }

  public isPortReady(): boolean {
    const ready = this.isOpen && this._isPortReady && this.writer !== null;
    logger.debug(
      `isPortReady check: isOpen=${this.isOpen}, _isPortReady=${this._isPortReady}, writer=${this.writer !== null}, result=${ready}`
    );
    return ready;
  }

  private async _notifyPortConnected(): Promise<void> {
    this._wasEverConnected = true;
    if (this._portStateHandler) {
      this._portStateHandler(true, [], undefined);
    }
  }

  private async _notifyPortDisconnected(
    errorType: ConnectionErrorType = ConnectionErrorType.UnknownError,
    errorMessage: string = 'Port disconnected'
  ): Promise<void> {
    if (!this._wasEverConnected) {
      logger.debug('Skipping DISCONNECTED — port was never connected');
      return;
    }

    if (this._portStateHandler) {
      this._portStateHandler(false, [], { type: errorType, message: errorMessage });
    }
  }

  private _handlePortClose(): void {
    logger.info('WebSerial port physically closed (via close())');
    if (this._portCloseResolve) {
      this._portCloseResolve();
      this._portCloseResolve = null;
    }
    this._handleConnectionLoss('Port closed via close()');
  }

  private _watchForPortClose(): void {
    if (!this._portClosePromise) return;

    this._portClosePromise
      .then(() => {
        this._handlePortClose();
      })
      .catch(() => {});
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
        if (hardClose && this.port && this.port.writable) {
          await this.writer.close().catch(() => {});
        }
      } catch (err: unknown) {
        logger.debug('Error releasing writer:', (err as Error).message);
      }
      this.writer = null;
    }

    if (hardClose && this.port) {
      try {
        await this.port.close();
        logger.debug('Port closed successfully');
        if (this._portCloseResolve) {
          this._portCloseResolve();
          this._portCloseResolve = null;
        }
      } catch (err: unknown) {
        logger.warn(`Error closing port: ${(err as Error).message}`);
      }
      this.port = null;
    }

    this.isOpen = false;
    this._isPortReady = false;
    this.readBuffer = allocUint8Array(0);
    this._emptyReadCount = 0;

    this._connectedSlaveIds.clear();
  }

  async connect(): Promise<void> {
    if (this._isConnecting) {
      logger.warn('Connection had already started, waiting...');
      return this._connectionPromise ?? Promise.resolve();
    }

    if (!this.isOpen && !this._isConnecting && !this._isDisconnecting) {
      logger.debug('Transport in disconnected state, resetting resources');
      await this._releaseAllResources(false);
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
      this._reconnectAttempts = 0;
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

      if (this.reader) {
        try {
          await this.reader.cancel();
          this.reader.releaseLock();
        } catch {}
        this.reader = null;
      }
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch {}
        this.writer = null;
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      logger.debug(`New writer created: ${this.writer !== null}, reader: ${this.reader !== null}`);
      this.isOpen = true;
      this._isPortReady = true;
      this._reconnectAttempts = 0;

      this._portClosePromise = new Promise<void>(resolve => {
        this._portCloseResolve = resolve;
      });
      this._watchForPortClose();

      this._startReading();
      logger.info('WebSerial port opened successfully with new instance');

      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      logger.error(`Failed to open WebSerial port: ${(err as Error).message}`);
      this.isOpen = false;
      this._isPortReady = false;
      this._isConnecting = false;

      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          ConnectionErrorType.ConnectionLost,
          (err as Error).message
        );
      }

      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        logger.info('Auto-reconnect enabled, starting reconnect process...');
        this._scheduleReconnect(err as Error);
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
              logger.debug('Read stream ended. It might restart if the port is still open.');
              break;
            }

            if (value && value.length > 0) {
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
            }
          } catch (readErr: unknown) {
            if (this._readLoopAbortController.signal.aborted) {
              logger.debug('Read loop aborted');
              break;
            }
            logger.warn(`Read error: ${(readErr as Error).message}`);
            this._handleConnectionLoss(`Read error: ${(readErr as Error).message}`);
            break;
          }
        }
      } catch (loopErr: unknown) {
        logger.error(`Unexpected error in read loop: ${(loopErr as Error).message}`);
        this._handleConnectionLoss(`Read loop failed: ${(loopErr as Error).message}`);
      } finally {
        this._readLoopActive = false;
        logger.debug('Read loop finished');
      }
    };

    loop().catch(err => {
      logger.error('Read loop promise rejected:', err);
      this._handleConnectionLoss(`Read loop promise rejected: ${err.message}`);
    });
  }

  async write(buffer: Uint8Array): Promise<void> {
    if (this._isFlushing) {
      logger.debug('Write operation aborted due to ongoing flush');
      throw new ModbusFlushError();
    }

    if (!this.isPortReady()) {
      logger.warn(`Write attempted on disconnected port`);
      throw new WebSerialWriteError('Port is not ready for writing');
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
        await this.writer!.write(buffer);
        logger.debug(`Wrote ${buffer.length} bytes to WebSerial port`);
      } catch (err: unknown) {
        if (abort.signal.aborted) {
          logger.warn(`Write timeout on WebSerial port`);
          const timeoutError = new ModbusTimeoutError('Write timeout');
          this._onError(timeoutError);
          throw timeoutError;
        } else {
          logger.error(`Write error on WebSerial port: ${(err as Error).message}`);
          const isPhysical =
            (err as Error).message.includes('failed to write') ||
            (err as Error).message.includes('device disconnected') ||
            (err as Error).message.includes('The device has been lost');

          if (isPhysical) {
            if (this.writer) {
              try {
                this.writer.releaseLock();
              } catch {}
              this.writer = null;
            }
            if (this.port && this.isOpen) {
              this.port.close().catch(() => {});
            }
            this._handleConnectionLoss('Write failed — port unplugged');
          } else {
            this._onError(err as Error);
          }
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

  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    if (!this.isPortReady()) {
      throw new WebSerialReadError('Port is not ready');
    }

    if (length <= 0) {
      throw new ModbusDataConversionError(length, 'positive integer');
    }

    const release = await this._operationMutex.acquire();
    const start = Date.now();
    try {
      return new Promise<Uint8Array>((resolve, reject) => {
        const check = () => {
          if (!this.isOpen) {
            return reject(new WebSerialReadError('Port is closed'));
          }
          if (this._isFlushing) {
            return reject(new ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = this.readBuffer.slice(0, length);
            this.readBuffer = this.readBuffer.slice(length);
            if (data.length !== length) {
              return reject(new ModbusInsufficientDataError(data.length, length));
            }
            return resolve(data);
          }

          if (Date.now() - start > timeout) {
            return reject(
              new ModbusTimeoutError(`Read timeout: No data received within ${timeout}ms`)
            );
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
      await this._notifyPortDisconnected(
        ConnectionErrorType.ManualDisconnect,
        'Port closed by user'
      );

      if (this._rejectConnection) {
        this._rejectConnection(new WebSerialConnectionError('Connection manually disconnected'));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      logger.info('WebSerial transport disconnected successfully');
    } catch (err: unknown) {
      logger.error(`Error during WebSerial transport shutdown: ${(err as Error).message}`);
    } finally {
      this._isDisconnecting = false;
      this.isOpen = false;
      this._isPortReady = false;
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
    logger.warn(`Modbus error: ${err.message}`);
  }

  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

    logger.warn(`Connection loss detected: ${reason}`);

    if (this._isConnecting && this._rejectConnection) {
      const err = new WebSerialConnectionError(`Connection lost during connect: ${reason}`);
      this._rejectConnection(err);
      this._resolveConnection = null;
      this._rejectConnection = null;
    }

    this.isOpen = false;
    this._isPortReady = false;
    this._readLoopActive = false;

    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {}
      this.writer = null;
    }
    if (this.reader) {
      try {
        this.reader.cancel();
        this.reader.releaseLock();
      } catch {}
      this.reader = null;
    }

    this._notifyPortDisconnected(ConnectionErrorType.ConnectionLost, reason);

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
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

      this._notifyPortDisconnected(ConnectionErrorType.MaxReconnect, maxAttemptsError.message);

      if (this._rejectConnection) {
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;

      return;
    }

    this._reconnectAttempts++;
    logger.info(
      `Scheduling reconnect in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
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

      if (this.reader) {
        try {
          await this.reader.cancel();
          this.reader.releaseLock();
        } catch {}
        this.reader = null;
      }
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch {}
        this.writer = null;
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();

      logger.debug(`New writer created: ${this.writer !== null}, reader: ${this.reader !== null}`);

      this.isOpen = true;
      this._isPortReady = true;
      this._reconnectAttempts = 0;

      this._portClosePromise = new Promise<void>(resolve => {
        this._portCloseResolve = resolve;
      });
      this._watchForPortClose();

      this._startReading();
      logger.info(`Reconnect successful`);
      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      logger.warn(`Reconnect attempt failed: ${(err as Error).message}`);
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

        await this._notifyPortDisconnected(
          ConnectionErrorType.MaxReconnect,
          maxAttemptsError.message
        );

        if (this._rejectConnection) {
          this._rejectConnection(maxAttemptsError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;
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

    if (this._portCloseResolve) {
      this._portCloseResolve();
      this._portCloseResolve = null;
    }

    this._readLoopActive = false;
    this._releaseAllResources(true).catch(() => {});

    this._notifyPortDisconnected(ConnectionErrorType.Destroyed, 'Transport destroyed');

    this.isOpen = false;
    this._isPortReady = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
  }
}

export = WebSerialTransport;
