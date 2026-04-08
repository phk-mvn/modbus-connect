// modbus/transport/node-transports/node-serialport.ts

import { SerialPort } from 'serialport';
import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import * as utils from '../../utils/utils.js';

import {
  ModbusFlushError,
  NodeSerialTransportError,
  NodeSerialConnectionError,
  NodeSerialReadError,
  NodeSerialWriteError,
  ModbusTimeoutError,
  ModbusInsufficientDataError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusConfigError,
  ModbusFramingError,
  ModbusParityError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusNoiseError,
} from '../../errors';

import {
  ITransport,
  INodeSerialTransportOptions,
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
} from '../../types/modbus-types';

const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 10,
} as const;

/**
 * NodeSerialTransport implements the ITransport interface using the 'serialport' library.
 * It provides reliable serial communication (RS232/RS485) with support for:
 * - Automatic reconnection with configurable attempts and intervals
 * - Read/write operations with timeouts and mutex protection
 * - Buffer management and overflow protection
 * - Device and port state tracking via callbacks
 * - Comprehensive error handling and logging
 */
export default class NodeSerialTransport implements ITransport {
  public isOpen: boolean = false;
  public logger: Logger;

  private path: string;
  private options: Required<INodeSerialTransportOptions>;
  private port: SerialPort | null = null;
  private readBuffer: Uint8Array = utils.allocUint8Array(0);

  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _reconnectTimeout: NodeJS.Timeout | null = null;
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;
  private _isFlushing: boolean = false;
  private _pendingFlushPromises: Array<() => void> = [];
  private _operationMutex: Mutex = new Mutex();
  private _connectionPromise: Promise<void> | null = null;
  private _resolveConnection: (() => void) | null = null;
  private _rejectConnection: ((reason?: Error | string | null) => void) | null = null;

  private _connectedSlaveIds: Set<number> = new Set();
  private _deviceStateHandler: TDeviceStateHandler | null = null;
  private _portStateHandler: TPortStateHandler | null = null;
  private _wasEverConnected: boolean = false;

  /**
   * Creates a new NodeSerialTransport instance.
   * @param portPath - Path to the serial port (e.g. '/dev/ttyUSB0' or 'COM3')
   * @param options - Configuration options for baud rate, timeouts, reconnection, etc.
   */
  constructor(portPath: string, options: INodeSerialTransportOptions = {}) {
    this.path = portPath;
    this.options = {
      baudRate: options.baudRate ?? 9600,
      dataBits: options.dataBits ?? 8,
      stopBits: options.stopBits ?? 1,
      parity: options.parity ?? 'none',
      readTimeout: options.readTimeout ?? 1000,
      writeTimeout: options.writeTimeout ?? 1000,
      maxBufferSize: options.maxBufferSize ?? NODE_SERIAL_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      RSMode: options.RSMode || 'RS485',
    };

    this.logger = pino({
      level: 'info',
      base: { component: 'Node RTU', path: this.path },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    this.logger.debug('Transport instance created');
  }

  /**
   * Opens the serial port and establishes the connection.
   * Handles reconnection logic, resource cleanup, and port state notifications.
   * If connection fails and reconnection is enabled, it will schedule automatic retries.
   * @throws NodeSerialConnectionError if connection fails and max attempts are reached
   */
  public async connect(): Promise<void> {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new NodeSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      this.logger.error(`Connection Fail: ${error.message}`);
      throw error;
    }

    if (this._isConnecting) {
      this.logger.warn(`Connection attemp already in progress`);
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

      if (this.port) {
        await this._releaseAllResources();
      }

      if (
        this.options.baudRate < NODE_SERIAL_CONSTANTS.MIN_BAUD_RATE ||
        this.options.baudRate > NODE_SERIAL_CONSTANTS.MAX_BAUD_RATE
      ) {
        throw new ModbusConfigError(`Invalid baud rate: ${this.options.baudRate}`);
      }

      await this._createAndOpenPort();
      this.logger.debug(`Serial port ${this.path} opened`);
      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      this.logger.info(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;

      if (this._wasEverConnected)
        await this._notifyPortDisconnected(EConnectionErrorType.ConnectionLost, error.message);

      if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
        const maxError = new NodeSerialConnectionError(
          `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
        );
        if (this._rejectConnection) {
          this._rejectConnection(maxError);
          this._resolveConnection = null;
          this._rejectConnection = null;
        }
        throw maxError;
      }

      if (this._shouldReconnect) {
        this._scheduleReconnect(error);
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
   * Creates and opens the SerialPort instance.
   * Sets up event listeners for data, error, and close events.
   */
  private async _createAndOpenPort(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const serialOptions = {
        path: this.path,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
      };
      this.port = new SerialPort(serialOptions);

      this.port.open((_err: Error | null) => {
        if (_err) {
          this.isOpen = false;
          if (_err.message.includes('permission'))
            reject(new NodeSerialConnectionError('Permission denied'));
          else if (_err.message.includes('busy'))
            reject(new NodeSerialConnectionError('Serial port is busy'));
          else if (_err.message.includes('no such file'))
            reject(new NodeSerialConnectionError('Serial port does not exists'));
          else reject(new NodeSerialConnectionError(_err.message));

          return;
        }

        this.isOpen = true;
        this._reconnectAttempts = 0;
        this._removeAllListeners();
        this.port?.on('data', this._onData.bind(this));
        this.port?.on('error', this._onError.bind(this));
        this.port?.on('close', this._onClose.bind(this));
        resolve();
      });
    });
  }

  /**
   * Handles incoming data from the serial port.
   * Appends data to the internal read buffer with overflow protection.
   */
  private _onData(data: Buffer): void {
    if (!this.isOpen) return;
    try {
      const chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
        this._handleError(
          new ModbusBufferOverflowError(
            this.readBuffer.length + chunk.length,
            this.options.maxBufferSize
          )
        );
        return;
      }
      this.readBuffer = utils.concatUint8Arrays([this.readBuffer, chunk]);
      if (this.readBuffer.length > this.options.maxBufferSize) {
        this.readBuffer = utils.sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
      }
    } catch (err: unknown) {
      this._handleError(err instanceof Error ? err : new NodeSerialTransportError(String(err)));
    }
  }

  /**
   * Handles serial port error events and maps them to appropriate Modbus errors.
   */
  private _onError(err: Error): void {
    this.logger.error(`Serial port ${this.path} error: ${err.message}`);
    if (err.message.includes('parity')) this._handleError(new ModbusParityError(err.message));
    else if (err.message.includes('frame')) this._handleError(new ModbusFramingError(err.message));
    else if (err.message.includes('overrun'))
      this._handleError(new ModbusOverrunError(err.message));
    else if (err.message.includes('collision'))
      this._handleError(new ModbusCollisionError(err.message));
    else if (err.message.includes('noise')) this._handleError(new ModbusNoiseError(err.message));
    else this._handleError(new NodeSerialTransportError(err.message));
  }

  /**
   * Handles the 'close' event of the serial port.
   */
  private _onClose(): void {
    this.logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._notifyPortDisconnected(EConnectionErrorType.PortClosed, 'Port was closed').catch(
      () => {}
    );
  }

  /**
   * Schedules a reconnection attempt after a delay.
   */
  private _scheduleReconnect(_err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) return;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      const maxError = new NodeSerialConnectionError(`Max reconnect attempts reached`);
      if (this._rejectConnection) this._rejectConnection(maxError);
      this._shouldReconnect = false;
      return;
    }
    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  /**
   * Attempts to reconnect to the serial port.
   */
  private async _attemptReconnect(): Promise<void> {
    try {
      if (this.port && this.port.isOpen) await this._releaseAllResources();
      await this._createAndOpenPort();
      this._reconnectAttempts = 0;
      await this._notifyPortConnected();
      if (this._resolveConnection) this._resolveConnection();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new NodeSerialConnectionError(String(error));
      this._reconnectAttempts++;
      if (
        this._shouldReconnect &&
        !this._isDisconnecting &&
        this._reconnectAttempts <= this.options.maxReconnectAttempts
      ) {
        this._scheduleReconnect(err);
      } else {
        const maxError = new NodeSerialConnectionError('Max reconnect attempts reached');
        if (this._rejectConnection) this._rejectConnection(maxError);
        this._shouldReconnect = false;
        await this._notifyPortDisconnected(EConnectionErrorType.MaxReconnect, maxError.message);
      }
    }
  }

  /**
   * Flushes the internal read buffer, discarding all pending data.
   * Useful before sending a new request in half-duplex (RS485) mode.
   */
  public async flush(): Promise<void> {
    if (this._isFlushing) {
      await Promise.all(this._pendingFlushPromises.map(p => p())).catch(() => {});
      return;
    }
    this._isFlushing = true;
    const p = new Promise<void>(resolve => this._pendingFlushPromises.push(resolve));
    try {
      this.readBuffer = utils.allocUint8Array(0);
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach(r => r());
      this._pendingFlushPromises = [];
    }
    return p;
  }

  /**
   * Writes data to the serial port.
   * Uses mutex to ensure exclusive access and includes drain to guarantee data is sent.
   * @param buffer - Data to send
   * @throws NodeSerialWriteError if write or drain fails
   */
  public async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.port || !this.port?.isOpen)
      throw new NodeSerialWriteError('Port Closed');
    if (buffer.length === 0) throw new ModbusBufferUnderrunError(0, 1);
    const release = await this._operationMutex.acquire();
    try {
      return new Promise<void>((resolve, reject) => {
        this.port!.write(buffer, 'binary', (_err: Error | null | undefined) => {
          if (_err) {
            const e = _err.message.includes('parity')
              ? new ModbusParityError(_err.message)
              : _err.message.includes('collision')
                ? new ModbusCollisionError(_err.message)
                : new NodeSerialWriteError(_err.message);
            this._handleError(e);
            return reject(e);
          }
          this.port!.drain((_drainErr: Error | null | undefined) => {
            if (_drainErr) {
              const e = new NodeSerialWriteError(_drainErr.message);
              this._handleError(e);
              return reject(e);
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
   * Reads a specified number of bytes from the internal buffer.
   * Polls the buffer at regular intervals until data is available or timeout occurs.
   * @param length - Number of bytes to read
   * @param timeout - Maximum time to wait for data
   * @returns Uint8Array containing the requested data
   * @throws ModbusTimeoutError, NodeSerialReadError, ModbusFlushError, etc.
   */
  public async read(
    length: number,
    timeout: number = this.options.readTimeout
  ): Promise<Uint8Array> {
    if (length <= 0) throw new ModbusDataConversionError(length, 'positive');
    const release = await this._operationMutex.acquire();
    const start = Date.now();
    try {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (!this.isOpen || !this.port || !this.port?.isOpen) {
            return reject(new NodeSerialReadError('Port is closed'));
          }
          if (this._isFlushing) {
            return reject(new ModbusFlushError());
          }
          if (this.readBuffer.length >= length) {
            const data = utils.sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = utils.sliceUint8Array(this.readBuffer, length);
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

          setTimeout(check, NODE_SERIAL_CONSTANTS.POLL_INTERVAL_MS);
        };
        check();
      });
    } finally {
      release();
    }
  }

  /**
   * Gracefully disconnects the serial port and stops reconnection attempts.
   */
  public async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection)
      this._rejectConnection(new NodeSerialConnectionError('Disconnected'));
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          EConnectionErrorType.ManualDisconnect,
          'Port closed by user'
        );
      }
      return;
    }
    await this._releaseAllResources();
    if (this._wasEverConnected) {
      await this._notifyPortDisconnected(
        EConnectionErrorType.ManualDisconnect,
        'Port closed by user'
      );
    }
    this._isDisconnecting = false;
  }

  /**
   * Immediately destroys the transport, releases all resources and stops reconnection.
   */
  destroy(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection) this._rejectConnection(new NodeSerialTransportError('Destroyed'));
    this._releaseAllResources().catch(() => {});
    if (this._wasEverConnected) {
      this._notifyPortDisconnected(EConnectionErrorType.Destroyed, 'Transport destroyed').catch(
        () => {}
      );
    }
  }

  /**
   * Centralized error handler that triggers connection loss logic.
   */
  private _handleError(err: Error): void {
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  /**
   * Handles connection loss by updating state and notifying listeners.
   */
  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

    this.logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;

    if (this._wasEverConnected) {
      this._notifyPortDisconnected(EConnectionErrorType.ConnectionLost, reason).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API for RS Mode and Device/Port State Tracking
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the current RS mode (RS485 or RS232).
   */
  public getRSMode(): TRSMode {
    return this.options.RSMode;
  }

  /**
   * Sets the handler for device connection state changes (per slave ID).
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the handler for port-level connection state changes.
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables device tracking (clears the device state handler).
   */
  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
    this.logger.debug('Device tracking disabled');
  }

  /**
   * Enables device tracking and optionally sets a new handler.
   */
  public async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) {
      this._deviceStateHandler = handler;
    }
    this.logger.debug('Device tracking enabled');
  }

  /**
   * Notifies that a specific slave/device has become connected.
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
   * Notifies that a specific slave/device has disconnected with error details.
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
   * Manually removes a device from the connected set.
   */
  public removeConnectedDevice(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) {
      this._connectedSlaveIds.delete(slaveId);
      this.logger.debug(`Manually removed device ${slaveId} from connected set`);
    }
  }

  /**
   * Notifies listeners that the port has successfully connected.
   */
  private async _notifyPortConnected(): Promise<void> {
    this._wasEverConnected = true;
    if (this._portStateHandler) {
      this._portStateHandler(true, [], undefined);
    }
  }

  /**
   * Notifies listeners that the port has disconnected with reason.
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
   * Releases all resources: removes listeners, closes the port, clears buffers and connected devices.
   */
  private async _releaseAllResources(): Promise<void> {
    this.logger.debug('Releasing NodeSerial resources');
    this._removeAllListeners();

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve, reject) => {
        this.port!.close((_err: Error | null) => {
          if (_err) reject(_err);
          else {
            this.logger.debug('Port closed successfully');
            resolve();
          }
        });
      });
    }

    this.port = null;
    this.isOpen = false;
    this.readBuffer = utils.allocUint8Array(0);
    this._connectedSlaveIds.clear();
  }

  /**
   * Removes all event listeners from the SerialPort instance.
   */
  private _removeAllListeners(): void {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }
}
