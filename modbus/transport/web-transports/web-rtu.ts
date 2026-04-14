// modbus/transport/web-transports/web-rtu.ts

import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import * as utils from '../../utils/utils.js';
import {
  EConnectionErrorType,
  ITransport,
  IWebSerialPort,
  IWebSerialPortOptions,
  IWebSerialTransportOptions,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
} from '../../types/modbus-types';
import {
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusConfigError,
  ModbusDataConversionError,
  ModbusFlushError,
  ModbusInsufficientDataError,
  ModbusTimeoutError,
  WebSerialConnectionError,
  WebSerialReadError,
  WebSerialTransportError,
  WebSerialWriteError,
  ModbusParityError,
  ModbusFramingError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusNoiseError,
} from '../../errors';

const WEB_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUDRATE: 115200,
  MAX_READ_BUFFER_SIZE: 65536,
  POLL_INTERVAL_MS: 5,
} as const;

/**
 * WebSerialTransport provides an implementation of the Modbus transport layer
 * using the Web Serial API, suitable for browser-based serial communication.
 */
export default class WebSerialTransport implements ITransport {
  public isOpen: boolean = false;
  public logger: Logger;

  private portFactory: () => Promise<IWebSerialPort>;
  private port: IWebSerialPort | null = null;
  private options: Required<IWebSerialTransportOptions>;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  private _readBuffer: Uint8Array;
  private _readBufferHead: number = 0;
  private _readBufferTail: number = 0;
  private _readBufferCount: number = 0;

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

  private _deviceStateHandler: TDeviceStateHandler | null = null;
  private _portStateHandler: TPortStateHandler | null = null;
  private _wasEverConnected: boolean = false;

  /**
   * Creates an instance of WebSerialTransport.
   * @param portFactory A function that returns a Promise for an IWebSerialPort instance.
   * @param options Configuration options for the serial port and transport behavior.
   */
  constructor(
    portFactory: () => Promise<IWebSerialPort>,
    options: IWebSerialTransportOptions = {}
  ) {
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

    this._readBuffer = new Uint8Array(WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE);
    this._operationMutex = new Mutex();

    this.logger = pino({
      level: 'debug',
      base: { component: 'WEB RTU' },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    this.logger.debug('Transport instance created');
  }

  /**
   * Gets the current RS Mode (e.g., RS485 or RS232).
   * @returns The TRSMode value.
   */
  public getRSMode(): TRSMode {
    return this.options.RSMode;
  }

  /**
   * Sets the callback handler for tracking device connection states.
   * @param handler A function to be called when a device connection status changes.
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the callback handler for the serial port status changes.
   * @param handler A function to be called when the port is connected or disconnected.
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables tracking of connected Modbus slave devices.
   */
  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
    this.logger.warn('Device connection tracking disabled');
  }

  /**
   * Enables tracking of connected Modbus slave devices.
   * @param handler Optional new handler for device state updates.
   */
  public async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) {
      this._deviceStateHandler = handler;
    }
    this.logger.debug('Device connection tracking enabled');
  }

  /**
   * Notifies the transport that a specific slave device is connected.
   * @param slaveId The ID of the Modbus slave device.
   */
  public notifyDeviceConnected(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) {
      return;
    }
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, true);
    }
  }

  /**
   * Notifies the transport that a specific slave device has disconnected.
   * @param slaveId The ID of the Modbus slave device.
   * @param errorType The category of the connection error.
   * @param errorMessage A descriptive error message.
   */
  public notifyDeviceDisconnected(
    slaveId: number,
    errorType: EConnectionErrorType,
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

  /**
   * Manually removes a device from the internal connected devices set.
   * @param slaveId The ID of the Modbus slave device to remove.
   */
  public removeConnectedDevice(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) {
      this._connectedSlaveIds.delete(slaveId);
      this.logger.debug(`Manually removed device ${slaveId} from connected set`);
    }
  }

  /**
   * Internal check to determine if the port is open and ready for I/O operations.
   * @returns True if the port is open and the writer is initialized.
   */
  private isPortReady(): boolean {
    const ready = this.isOpen && this._isPortReady && this.writer !== null;
    return ready;
  }

  /**
   * Internal helper to trigger the port connection notification handler.
   */
  private async _notifyPortConnected(): Promise<void> {
    this._wasEverConnected = true;
    if (this._portStateHandler) {
      this._portStateHandler(true, [], undefined);
    }
  }

  /**
   * Internal helper to trigger the port disconnection notification handler.
   * @param errorType The reason for disconnection.
   * @param errorMessage Details regarding the disconnection.
   */
  private async _notifyPortDisconnected(
    errorType: EConnectionErrorType = EConnectionErrorType.UnknownError,
    errorMessage: string = 'Port disconnected'
  ): Promise<void> {
    if (!this._wasEverConnected) {
      this.logger.debug('Skipping DISCONNECTED - port was never connected');
      return;
    }

    if (this._portStateHandler) {
      this._portStateHandler(false, [], { type: errorType, message: errorMessage });
    }
  }

  /**
   * Handles the low-level physical closure of the serial port.
   */
  private _handlerPortClose(): void {
    this.logger.info('WebSerial port physically closed (via close())');
    if (this._portCloseResolve) {
      this._portCloseResolve();
      this._portCloseResolve = null;
    }
    this._handleConnectionLoss('Port closed via close()');
  }

  /**
   * Monitors the closure promise to trigger cleanup when the port closes.
   */
  private _watchForPortClose(): void {
    if (!this._portClosePromise) return;

    this._portClosePromise.then(() => this._handlerPortClose());
  }

  /**
   * Releases all resources associated with the transport, such as readers, writers, and buffers.
   * @param hardClose If true, attempts to close the underlying physical port as well.
   */
  private async _releaseAllResources(hardClose = false): Promise<void> {
    this.logger.debug('Releasing WebSerial resources');

    this._readLoopActive = false;
    if (this._readLoopAbortController) {
      this._readLoopAbortController.abort();
      this._readLoopAbortController = null;
    }

    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.writer) {
      this.writer.releaseLock();
      if (hardClose && this.port && this.port.writable) {
        await this.writer.close();
      }
      this.writer = null;
    }

    if (hardClose && this.port) {
      await this.port.close();
      if (this._portCloseResolve) {
        this._portCloseResolve();
        this._portCloseResolve = null;
      }
      this.port = null;
    }

    this.isOpen = false;
    this._isPortReady = false;
    this._readBufferHead = 0;
    this._readBufferTail = 0;
    this._readBufferCount = 0;
    this._emptyReadCount = 0;
    this._isPortReady = false;
    this._emptyReadCount = 0;

    this._connectedSlaveIds.clear();
  }

  /**
   * Establishes a connection to the serial port.
   * Performs port configuration and initializes reading/writing streams.
   */
  public async connect(): Promise<void> {
    if (this._isConnecting) {
      this.logger.warn('Connection had already started, waiting...');
      return this._connectionPromise ?? Promise.resolve();
    }

    if (!this.isOpen && !this._isConnecting && !this._isDisconnecting) {
      this.logger.debug('Transport in disconnected state, resetting resources');
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

      this.logger.debug('Requesting new SerialPort instance from factory...');

      if (this.port && this.isOpen) {
        this.logger.debug('Closing existing port before reconnecting');
        await this._releaseAllResources(true);
      }

      this.port = await this.portFactory();

      if (!this.port || typeof this.port.open !== 'function') {
        throw new WebSerialConnectionError('Port factory did not return a valid SerialPort object');
      }

      this.logger.debug('New SerialPort instance acquired');

      if (
        this.options.baudRate < WEB_SERIAL_CONSTANTS.MIN_BAUD_RATE ||
        this.options.baudRate > WEB_SERIAL_CONSTANTS.MAX_BAUDRATE
      ) {
        throw new ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }

      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as IWebSerialPortOptions);

      const readable = this.port.readable;
      const writable = this.port.writable;

      if (!readable || !writable) {
        this.logger.error('Serial port not readable/writable after open');
        await this._releaseAllResources(true);
        throw new WebSerialConnectionError('Serial port not readable/writable after open');
      }

      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }

      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.isOpen = true;
      this._isPortReady = true;
      this._reconnectAttempts = 0;
      this._portClosePromise = new Promise<void>(resolve => (this._portCloseResolve = resolve));
      this._watchForPortClose();
      this._startReading();

      this.logger.info('WebSerial port opened successfully with new instance');

      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      this.logger.error(`Failed to open WebSerial port: ${(err as Error).message}`);
      this.isOpen = false;
      this._isPortReady = false;
      this._isConnecting = false;

      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          EConnectionErrorType.ConnectionLost,
          (err as Error).message
        );
      }

      if (this._shouldReconnect && this._reconnectAttempts < this.options.maxReconnectAttempts) {
        this.logger.info('Auto-reconnect enabled, starting reconnect process...');
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

  /**
   * Starts the continuous reading loop from the serial port.
   * Appends incoming data to the internal read buffer.
   */
  private _startReading(): void {
    if (this._readLoopActive) return;
    if (!this.isOpen || !this.reader) {
      this.logger.warn('Cannot start reading: port not open, no reader or loop already active');
      return;
    }

    this._readLoopActive = true;
    this._readLoopAbortController = new AbortController();

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
              break;
            }

            if (value && value.length > 0) {
              this._emptyReadCount = 0;
              const chunkLen = value.length;

              if (this._readBufferCount + chunkLen > WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE) {
                this.logger.error('Buffer overflow detected');
                throw new ModbusBufferOverflowError(
                  this._readBufferCount + chunkLen,
                  WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE
                );
              }

              const spaceAtEnd = WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE - this._readBufferHead;

              if (chunkLen <= spaceAtEnd) {
                this._readBuffer.set(value, this._readBufferHead);
              } else {
                this._readBuffer.set(value.subarray(0, spaceAtEnd), this._readBufferHead);
                this._readBuffer.set(value.subarray(spaceAtEnd), 0);
              }

              this._readBufferHead =
                (this._readBufferHead + chunkLen) % WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE;
              this._readBufferCount += chunkLen;
            } else {
              this._emptyReadCount++;
              if (this._emptyReadCount >= this.options.maxEmptyReadsBeforeReconnect) {
                this.logger.warn(
                  `Max empty reads (${this.options.maxEmptyReadsBeforeReconnect}) reached. Triggering reconnect`
                );
                this._handleConnectionLoss('Too many empty reads');
                break;
              }
            }
          } catch (readErr: unknown) {
            if (this._readLoopAbortController.signal.aborted) {
              break;
            }
            this.logger.error(`Read error: ${(readErr as Error).message}`);
            this._handleConnectionLoss(`Read error: ${(readErr as Error).message}`);
            break;
          }
        }
      } catch (loopErr: unknown) {
        this._handleConnectionLoss(`Read loop failed: ${(loopErr as Error).message}`);
      } finally {
        this._readLoopActive = false;
      }
    };

    loop().catch(err => {
      this._handleConnectionLoss(`Read loop promise rejected: ${err.message}`);
    });
  }

  /**
   * Writes a buffer of data to the serial port.
   * @param buffer The Uint8Array to be sent.
   */
  public async write(buffer: Uint8Array): Promise<void> {
    if (this._isFlushing) throw new ModbusFlushError();
    if (!this.isPortReady) throw new WebSerialWriteError('Port is not ready for writing');
    if (buffer.length === 0) throw new ModbusBufferUnderrunError(0, 1);

    const release = await this._operationMutex.acquire();
    try {
      const timeout = this.options.writeTimeout;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);

      try {
        await this.writer!.write(buffer);
      } catch (err: unknown) {
        if (abort.signal.aborted) {
          const timeoutError = new ModbusTimeoutError('Write timeout');
          this._onError(timeoutError);
          throw timeoutError;
        } else {
          const isPhysical =
            (err as Error).message.includes('failed to write') ||
            (err as Error).message.includes('device disconnected') ||
            (err as Error).message.includes('The device has been lost');

          if (isPhysical) {
            if (this.writer) {
              this.writer.releaseLock();
              this.writer = null;
            }

            if (this.port && this.isOpen) {
              this.port.close();
            }

            this._handleConnectionLoss('Write failed - port unplugged');
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

  /**
   * Reads a specified number of bytes from the internal buffer.
   * Waits for data to arrive if the buffer is currently insufficient.
   * @param length Number of bytes to read.
   * @param timeout Maximum time to wait for the data in milliseconds.
   * @returns A Promise that resolves to the requested Uint8Array.
   */
  public async read(
    length: number,
    timeout: number = this.options.readTimeout
  ): Promise<Uint8Array> {
    if (!this.isPortReady()) {
      throw new WebSerialReadError('Port is not ready');
    }

    if (length <= 0) {
      throw new ModbusDataConversionError(length, 'positive interger');
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

          if (this._readBufferCount >= length) {
            let result: Uint8Array;
            const spaceAtEnd = WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE - this._readBufferTail;

            if (length <= spaceAtEnd) {
              result = this._readBuffer.slice(this._readBufferTail, this._readBufferTail + length);
            } else {
              result = new Uint8Array(length);
              const part1 = this._readBuffer.subarray(this._readBufferTail);
              const part2 = this._readBuffer.subarray(0, length - spaceAtEnd);
              result.set(part1, 0);
              result.set(part2, part1.length);
            }

            this._readBufferTail =
              (this._readBufferTail + length) % WEB_SERIAL_CONSTANTS.MAX_READ_BUFFER_SIZE;
            this._readBufferCount -= length;

            return resolve(result);
          }

          if (Date.now() - start >= timeout) {
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

  /**
   * Disconnects the transport and stops all ongoing operations and reconnection attempts.
   */
  public async disconnect(): Promise<void> {
    this.logger.info('Disconnecting WebSerial transport...');
    this._shouldReconnect = false;
    this._isDisconnecting = true;

    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      await this._releaseAllResources(true);
      await this._notifyPortDisconnected(
        EConnectionErrorType.ManualDisconnect,
        'Port closed by user'
      );

      if (this._rejectConnection) {
        this._rejectConnection(new WebSerialConnectionError('Connection manually disconnected'));
        this._resolveConnection = null;
        this._rejectConnection = null;
      }

      this.logger.info('WebSerial transport disconnected successfully');
    } catch (err: unknown) {
      this.logger.error(`Error during WebSerial transport shutdown: ${(err as Error).message}`);
    } finally {
      this._isDisconnecting = false;
      this.isOpen = false;
      this._isPortReady = false;
      this.port = null;
      this.reader = null;
      this.writer = null;
    }
  }

  /**
   * Clears the current read buffer and resets the empty read counter.
   */
  public async flush(): Promise<void> {
    if (this._isFlushing) {
      await Promise.all(this._pendingFlushPromises);
      return;
    }

    this._isFlushing = true;
    const flushPromise = new Promise<void>(resolve => {
      this._pendingFlushPromises.push(resolve);
    });

    try {
      this._readBufferHead = 0;
      this._readBufferTail = 0;
      this._readBufferCount = 0;
      this._emptyReadCount = 0;
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach(resolve => resolve());
      this._pendingFlushPromises = [];
    }
  }

  /**
   * Maps generic serial errors to specific Modbus error types and logs them.
   * @param err The Error object caught during communication.
   */
  private _onError(err: Error): void {
    this.logger.error(`Serial port ${this.port} error: ${err.message}`);
    if (err.message.includes('parity')) this._handleError(new ModbusParityError(err.message));
    else if (err.message.includes('frame')) this._handleError(new ModbusFramingError(err.message));
    else if (err.message.includes('overrun'))
      this._handleError(new ModbusOverrunError(err.message));
    else if (err.message.includes('collision'))
      this._handleError(new ModbusCollisionError(err.message));
    else if (err.message.includes('noise')) this._handleError(new ModbusNoiseError(err.message));
    else this._handleError(new WebSerialTransportError(err.message));
  }

  /**
   * Internal bridge to trigger connection loss handling upon a specific error.
   * @param err The error that occurred.
   */
  private _handleError(err: Error): void {
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  /**
   * Manages state changes when the connection is lost and decides whether to trigger reconnection.
   * @param reason A string describing why the connection was lost.
   */
  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

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
      this.writer.releaseLock();
      this.writer = null;
    }

    this._notifyPortDisconnected(EConnectionErrorType.ConnectionLost, reason);

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
  }

  /**
   * Schedules a reconnection attempt after a failure.
   * @param err The error that triggered the reconnection requirement.
   */
  private _scheduleReconnect(err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) {
      return;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      const maxAttemptsError = new WebSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );

      this._notifyPortDisconnected(EConnectionErrorType.MaxReconnect, maxAttemptsError.message);

      if (this._rejectConnection) {
        this._rejectConnection(maxAttemptsError);
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
      this._shouldReconnect = false;

      return;
    }

    this._reconnectAttempts++;
    this.logger.info(
      `Scheduling reconnect in ${this.options.reconnectInterval} ms (attempt ${this._reconnectAttempts}) due to: ${err.message}`
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  /**
   * Internal logic to perform a reconnection attempt by re-opening the port.
   */
  private async _attemptReconnect(): Promise<void> {
    try {
      if (this.port && this.isOpen) {
        await this._releaseAllResources(true);
      }

      this.port = await this.portFactory();
      if (!this.port || typeof this.port.open !== 'function') {
        throw new Error('Port factory did not return a valid SerialPort object');
      }

      await this.port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: 'none',
      } as IWebSerialPortOptions);

      const readable = this.port.readable;
      const writable = this.port.writable;

      if (!readable || !writable) {
        throw new WebSerialConnectionError('Serial port not readable/writable after open');
      }

      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }

      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }

      this.reader = readable.getReader();
      this.writer = writable.getWriter();

      this.isOpen = true;
      this._isPortReady = true;
      this.isOpen = true;
      this._isPortReady = true;
      this._reconnectAttempts = 0;
      this._portClosePromise = new Promise<void>(resolve => {
        this._portCloseResolve = resolve;
      });
      this._watchForPortClose();
      this._startReading();

      this.logger.info('Reconnect successfully');
      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
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
          EConnectionErrorType.MaxReconnect,
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

  /**
   * Destroys the transport instance, cleaning up all resources and preventing future connections.
   */
  destroy(): void {
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
    this._releaseAllResources(true);
    this._notifyPortDisconnected(EConnectionErrorType.Destroyed, 'Transport destroyed');

    this.isOpen = false;
    this._isPortReady = false;
    this._isConnecting = false;
    this._isDisconnecting = false;
  }
}
