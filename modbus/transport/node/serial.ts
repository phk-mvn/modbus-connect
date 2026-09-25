// modbus/transport/node/serial.ts

import { SerialPort } from 'serialport';
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mutex } from 'async-mutex';
import { Logger, type ILogObj } from 'tslog';
import { createTsLogger } from '../../utils/logger.js';
import * as utils from '../../utils/buffer.js';

import {
  ModbusFlushError,
  NodeSerialTransportError,
  NodeSerialConnectionError,
  NodeSerialReadError,
  NodeSerialWriteError,
  ModbusTimeoutError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusConfigError,
  ModbusFramingError,
  ModbusParityError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusNoiseError,
} from '../../core/errors.js';

import {
  ITransport,
  INodeSerialTransportOptions,
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
} from '../../types/public.js';
import { TrafficSniffer } from '../trackers/traffic-sniffer.js';

const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 5,
} as const;

/**
 * NodeSerialTransport implements the ITransport interface using the 'serialport' library.
 * It provides reliable serial communication (RS232/RS485) with support for:
 * - Automatic reconnection with configurable attempts and intervals
 * - Read/write operations with timeouts and mutex protection
 * - Buffer management and overflow protection
 * - Device and port state tracking via callbacks
 * - Non-invasive traffic sniffing and real-time protocol analysis
 */
export default class NodeSerialTransport implements ITransport {
  public isOpen: boolean = false;
  public logger: Logger<ILogObj>;

  private path: string;
  private options: Required<INodeSerialTransportOptions>;
  private port: SerialPort | null = null;

  private _sniffer: TrafficSniffer | null = null;
  private _waitingForResponse: boolean = false;
  /** Timestamp of the last received byte — used for the silence pause before recording. */
  private _lastRxAt: number = 0;
  /** Port lock file: prevent a second process from silently sharing the same line. */
  private _lockPath: string | null = null;

  private _readBuffer: Uint8Array = utils.allocUint8Array(0);
  private _readBufferHead: number = 0;
  private _readBufferTail: number = 0;
  private _readBufferCount: number = 0;

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
   *
   * @param portPath - Path to the serial port (e.g. '/dev/ttyUSB0' or 'COM3').
   * @param options - Configuration options for baud rate, timeouts, reconnection, etc.
   * @param options.baudRate - Communication baud rate (default: 9600).
   * @param options.dataBits - Number of data bits (default: 8).
   * @param options.stopBits - Number of stop bits (default: 1).
   * @param options.parity - Parity checking mode ('none', 'even', 'odd', etc.) (default: 'none').
   * @param options.readTimeout - Read operation timeout in milliseconds (default: 1000).
   * @param options.writeTimeout - Write operation timeout in milliseconds (default: 1000).
   * @param options.maxBufferSize - Internal read buffer size in bytes (default: 4096).
   * @param options.reconnectInterval - Delay between reconnection attempts in milliseconds (default: 3000).
   * @param options.maxReconnectAttempts - Maximum reconnection attempts before giving up (default: Infinity).
   * @param options.RSMode - RS mode ('RS485' or 'RS232') (default: 'RS485').
   * @param options.interFrameDelayMs - Delay between frames for bus silence (default: 0).
   * @param options.exclusiveLock - Whether to acquire exclusive process file lock (default: true).
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
      interFrameDelayMs: options.interFrameDelayMs ?? 0,
      exclusiveLock: options.exclusiveLock ?? true,
    };

    this._readBuffer = new Uint8Array(this.options.maxBufferSize);

    this.logger = createTsLogger({
      name: 'Node RTU',
      bindings: { path: this.path },
    });

    this.logger.debug('Transport instance created');
  }

  /**
   * Attaches a TrafficSniffer instance to monitor and analyze raw serial traffic.
   * This allows for sub-millisecond latency tracking and real-time protocol inspection.
   *
   * @param sniffer - The TrafficSniffer instance to use for monitoring.
   * @returns void
   */
  public setSniffer(sniffer: TrafficSniffer): void {
    this._sniffer = sniffer;
  }

  /**
   * Opens the serial port and establishes the connection.
   * Handles reconnection logic, resource cleanup, and port state notifications.
   * If connection fails and reconnection is enabled, it will schedule automatic retries.
   *
   * @returns Promise resolving when the port is opened or rejection if failed.
   * @throws {NodeSerialConnectionError} If connection fails and max attempts are reached.
   * @throws {ModbusConfigError} If baud rate is outside valid bounds.
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
    // Rejecting this internal promise (disconnect, max reconnect attempts) must never become an
    // unhandled rejection: callers that await `connect()` still get the error, but Node no longer
    // treats it as fatal when nobody is waiting.
    void this._connectionPromise.catch(() => undefined);

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

      if (this._shouldReconnect && !this._isPermanentOpenFailure(error)) {
        this._scheduleReconnect(error);
        // We do not resolve connect(): in practice, the port is not yet open. We return a pending promise
        // that resolves only when the reconnection actually opens the port (or
        // rejects if attempts are exhausted)—otherwise, the controller erroneously sets the state to 'connected'.
        return this._connectionPromise ?? Promise.resolve();
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
   *
   * @returns Promise resolving when the port is opened and flushed.
   * @throws {NodeSerialConnectionError} If opening the port fails.
   * @private
   */
  private async _createAndOpenPort(): Promise<void> {
    this._acquirePortLock();
    return new Promise<void>((resolve, reject) => {
      const serialOptions = {
        path: this.path,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        autoOpen: false,
        // Exclusive port access: a second master on the same line must receive
        // an explicit error rather than silently corrupting frames for both parties
        // (this manifests as "sometimes there is no response" even when the device is active).
        lock: true,
      };
      this.port = new SerialPort(serialOptions);

      this.port.open((_err: Error | null) => {
        if (_err) {
          this.isOpen = false;
          if (_err.message.includes('permission') || _err.message.includes('access denied'))
            reject(new NodeSerialConnectionError('Permission denied'));
          else if (_err.message.includes('busy'))
            reject(new NodeSerialConnectionError('Serial port is busy'));
          else if (
            _err.message.includes('no such file') ||
            _err.message.includes('file not found') ||
            _err.message.includes('no such device')
          )
            reject(new NodeSerialConnectionError('Serial port does not exist'));
          else reject(new NodeSerialConnectionError(_err.message));

          return;
        }

        this.isOpen = true;
        this._reconnectAttempts = 0;
        this._removeAllListeners();
        this.port?.on('data', this._onData.bind(this));
        this.port?.on('error', this._onError.bind(this));
        this.port?.on('close', this._onClose.bind(this));

        // Clear any leftover data in the driver's receive buffer from the previous session:
        // after the USB adapter reconnects, there may be stale data present that would
        // otherwise end up in the response to the first request (a stale frame leading
        // to a false timeout or a corrupted PDU).
        this._readBufferCount = 0;
        this._readBufferHead = 0;
        this._readBufferTail = 0;
        this.port?.flush((_flushErr: Error | null | undefined) => {
          if (_flushErr) {
            this.logger.warn(`Failed to flush serial port on open: ${_flushErr.message}`);
          }
          resolve();
        });
      });
    });
  }

  /**
   * Handles incoming data from the serial port.
   * Appends data to the internal read buffer with overflow protection.
   *
   * @param data - Raw buffer received from the serial port.
   * @returns void
   * @private
   */
  private _onData(data: Buffer): void {
    if (!this.isOpen) return;
    this._lastRxAt = Date.now();

    if (this._sniffer && this._waitingForResponse && this._readBufferCount === 0) {
      this._sniffer.recordRxStart();
      this._waitingForResponse = false;
    }

    try {
      const chunkLen = data.length;

      if (this._readBufferCount + chunkLen > this.options.maxBufferSize) {
        this._handleError(
          new ModbusBufferOverflowError(
            this._readBufferCount + chunkLen,
            this.options.maxBufferSize
          )
        );
        return;
      }

      const spaceAtEnd = this.options.maxBufferSize - this._readBufferHead;

      if (chunkLen <= spaceAtEnd) {
        this._readBuffer.set(data, this._readBufferHead);
      } else {
        this._readBuffer.set(data.subarray(0, spaceAtEnd), this._readBufferHead);
        this._readBuffer.set(data.subarray(spaceAtEnd), 0);
      }

      this._readBufferHead = (this._readBufferHead + chunkLen) % this.options.maxBufferSize;
      this._readBufferCount += chunkLen;
    } catch (err: unknown) {
      this._handleError(err instanceof Error ? err : new NodeSerialTransportError(String(err)));
    }
  }

  /**
   * Handles serial port error events and maps them to appropriate Modbus errors.
   *
   * @param err - Error emitted by the serial port.
   * @returns void
   * @private
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
   * Persistent port opening errors: reconnection will not fix them, so the caller must
   * be notified of the problem immediately (port busy/blocked, insufficient permissions, device missing).
   *
   * @param error - The error encountered when opening the port.
   * @returns True if the failure is permanent, false otherwise.
   * @private
   */
  private _isPermanentOpenFailure(error: Error): boolean {
    return /already in use|busy|permission|access denied|does not exist|file not found|no such device|invalid handle|cannot open/i.test(
      error.message
    );
  }

  /**
   * Constructs the lock file path for this port in the system temporary directory.
   *
   * @returns The absolute path to the lock file.
   * @private
   */
  private _lockFilePath(): string {
    const safe = this.path.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(tmpdir(), `modbus-connect-${safe}.lock`);
  }

  /**
   * Acquires an exclusive lock on the port.
   *
   * Rationale: macOS and its drivers allow two processes to open the same port; consequently,
   * requests from two masters collide on the line—manifesting externally as the device
   * "sometimes failing to respond," even though the line is physically occupied by the other master.
   * The lock turns this situation into an explicit error rather than causing silent frame corruption.
   *
   * @returns void
   * @throws {NodeSerialConnectionError} If the port is already locked by another active process.
   * @private
   */
  private _acquirePortLock(): void {
    if (!this.options.exclusiveLock) return;

    const lockPath = this._lockFilePath();
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      this._lockPath = lockPath;
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    let owner: number;
    try {
      owner = Number(readFileSync(lockPath, 'utf8').trim()) || 0;
    } catch {
      owner = 0;
    }

    let alive = false;
    if (owner > 0) {
      try {
        process.kill(owner, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }

    if (alive && owner !== process.pid) {
      throw new NodeSerialConnectionError(
        `Serial port ${this.path} is already in use by process ${owner} ` +
          `(another app or a leftover instance). Stop it or delete ${lockPath}.`
      );
    }

    try {
      unlinkSync(lockPath);
    } catch {
      /** */
    }
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
    this._lockPath = lockPath;
  }

  /**
   * Releases the filesystem port lock (called on explicit disconnect).
   *
   * @returns void
   * @private
   */
  private _releasePortLock(): void {
    if (!this._lockPath) return;
    try {
      unlinkSync(this._lockPath);
    } catch {
      /** */
    }
    this._lockPath = null;
  }

  /**
   * Handles the 'close' event of the serial port.
   *
   * @returns void
   * @private
   */
  private _onClose(): void {
    this.logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;
    this._notifyPortDisconnected(EConnectionErrorType.PortClosed, 'Port was closed').catch(err =>
      this.logger.error({ err }, 'Error in port disconnect notification')
    );
    this._connectedSlaveIds.clear();
    this._readBufferCount = 0;
    this._readBufferHead = 0;
    this._readBufferTail = 0;

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error('Serial port closed unexpectedly'));
    }
  }

  /**
   * Schedules a reconnection attempt after a delay.
   *
   * @param _err - The error that prompted reconnection.
   * @returns void
   * @private
   */
  private _scheduleReconnect(_err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) return;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      const maxError = new NodeSerialConnectionError(`Max reconnect attempts reached`);
      if (this._rejectConnection) {
        this._rejectConnection(maxError);
        this._rejectConnection = null;
      }
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
   *
   * @returns Promise resolving when reconnection succeeds or next attempt is scheduled.
   * @private
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
        if (this._rejectConnection) {
          this._rejectConnection(maxError);
          this._rejectConnection = null;
        }
        this._shouldReconnect = false;
        await this._notifyPortDisconnected(EConnectionErrorType.MaxReconnect, maxError.message);
      }
    }
  }

  /**
   * Flushes the internal read buffer, discarding all pending data.
   * Useful before sending a new request in half-duplex (RS485) mode.
   *
   * @returns Promise resolving when buffer flush completes.
   */
  public async flush(): Promise<void> {
    if (this._isFlushing) {
      await Promise.all(this._pendingFlushPromises.map(p => p())).catch(() => {});
      return;
    }
    this._isFlushing = true;
    const p = new Promise<void>(resolve => this._pendingFlushPromises.push(resolve));

    try {
      this._readBufferHead = 0;
      this._readBufferTail = 0;
      this._readBufferCount = 0;
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
   *
   * @param buffer - Data to send.
   * @returns Promise resolving when write and drain complete.
   * @throws {NodeSerialWriteError} If port is closed or writing/draining fails.
   * @throws {ModbusBufferUnderrunError} If buffer is empty.
   */
  public async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.port || !this.port?.isOpen)
      throw new NodeSerialWriteError('Port Closed');
    if (buffer.length === 0) throw new ModbusBufferUnderrunError(0, 1);
    const release = await this._operationMutex.acquire();
    try {
      await this._waitForBusSilence();
      return new Promise<void>((resolve, reject) => {
        if (this._sniffer) {
          this._sniffer?.recordTx(this.path, buffer, 'rtu');
          this._waitingForResponse = true;
        }

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
   * Waits for the bus to remain silent for `interFrameDelayMs` after the last byte received.
   *
   * Why: RTU requires an inter-frame pause, and the USB-to-RS485 adapter needs time to switch
   * from receive mode to transmit mode. If writing occurs immediately after a response arrives,
   * the first bytes of the next request (the device address) get cut off—causing the slave
   * to see a corrupted frame and remain silent.
   *
   * @returns Promise resolving after the required silence period.
   * @private
   */
  private async _waitForBusSilence(): Promise<void> {
    const delay = this.options.interFrameDelayMs;
    if (!delay || delay <= 0) return;

    const elapsed = Date.now() - this._lastRxAt;
    if (elapsed >= delay) return;

    await new Promise<void>(resolve => setTimeout(resolve, delay - elapsed));
  }

  /**
   * Reads a specified number of bytes from the internal buffer.
   * Polls the buffer at regular intervals until data is available or timeout occurs.
   *
   * @param length - Number of bytes to read.
   * @param timeout - Maximum time to wait for data in milliseconds (defaults to options.readTimeout).
   * @returns Uint8Array containing the requested data.
   * @throws {ModbusDataConversionError} If length <= 0.
   * @throws {NodeSerialReadError} If port is closed during read.
   * @throws {ModbusFlushError} If buffer flush occurs during read.
   * @throws {ModbusTimeoutError} If no data received within timeout.
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

          if (this._readBufferCount >= length) {
            let result: Uint8Array;
            const spaceAtEnd = this.options.maxBufferSize - this._readBufferTail;

            if (length <= spaceAtEnd) {
              result = this._readBuffer.slice(this._readBufferTail, this._readBufferTail + length);
            } else {
              result = new Uint8Array(length);
              const part1 = this._readBuffer.subarray(this._readBufferTail);
              const part2 = this._readBuffer.subarray(0, length - spaceAtEnd);
              result.set(part1, 0);
              result.set(part2, part1.length);
            }

            this._readBufferTail = (this._readBufferTail + length) % this.options.maxBufferSize;
            this._readBufferCount -= length;

            if (this._sniffer) this._sniffer.recordRxEnd(this.path, result, 'rtu');

            return resolve(result);
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
   *
   * @returns Promise resolving when disconnection completes and resources are released.
   */
  public async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection) {
      this._rejectConnection(new NodeSerialConnectionError('Disconnected'));
      this._rejectConnection = null;
    }
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      this._releasePortLock();
      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          EConnectionErrorType.ManualDisconnect,
          'Port closed by user'
        );
      }
      return;
    }
    await this._releaseAllResources();
    this._releasePortLock();
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
   *
   * @returns void
   */
  destroy(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection) {
      this._rejectConnection(new NodeSerialTransportError('Destroyed'));
      this._rejectConnection = null;
    }
    this._releaseAllResources().catch(err =>
      this.logger.error({ err }, 'Error releasing resources during destroy')
    );
    this._releasePortLock();
    if (this._wasEverConnected) {
      this._notifyPortDisconnected(EConnectionErrorType.Destroyed, 'Transport destroyed').catch(
        () => {}
      );
    }
  }

  /**
   * Centralized error handler that triggers connection loss logic.
   *
   * @param err - Error that occurred.
   * @returns void
   * @private
   */
  private _handleError(err: Error): void {
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  /**
   * Handles connection loss by updating state and notifying listeners.
   *
   * @param reason - Reason description for connection loss.
   * @returns void
   * @private
   */
  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

    this.logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;
    this._readBufferCount = 0;
    this._readBufferHead = 0;
    this._readBufferTail = 0;

    if (this._wasEverConnected) {
      this._notifyPortDisconnected(EConnectionErrorType.ConnectionLost, reason).catch(err =>
        this.logger.error({ err }, 'Error in port disconnect notification')
      );
    }

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect(new Error(reason));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public API for RS Mode and Device/Port State Tracking
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the current RS mode (RS485 or RS232).
   *
   * @returns The configured RS mode.
   */
  public getRSMode(): TRSMode {
    return this.options.RSMode;
  }

  /**
   * Sets the handler for device connection state changes (per slave ID).
   *
   * @param handler - Callback function for device state changes.
   * @returns void
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the handler for port-level connection state changes.
   *
   * @param handler - Callback function for port state changes.
   * @returns void
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables device tracking (clears the device state handler).
   *
   * @returns Promise resolving when device tracking is disabled.
   */
  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
    this.logger.debug('Device tracking disabled');
  }

  /**
   * Enables device tracking and optionally sets a new handler.
   *
   * @param handler - Optional new device state handler callback.
   * @returns Promise resolving when device tracking is enabled.
   */
  public async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) {
      this._deviceStateHandler = handler;
    }
    this.logger.debug('Device tracking enabled');
  }

  /**
   * Notifies that a specific slave/device has become connected.
   *
   * @param slaveId - Slave ID of the connected device.
   * @returns void
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
   *
   * @param slaveId - Slave ID of the disconnected device.
   * @param errorType - Reason category for disconnection.
   * @param errorMessage - Description text for the disconnection.
   * @returns void
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
   *
   * @param slaveId - Slave ID to remove.
   * @returns void
   */
  public removeConnectedDevice(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) {
      this._connectedSlaveIds.delete(slaveId);
      this.logger.debug(`Manually removed device ${slaveId} from connected set`);
    }
  }

  /**
   * Notifies listeners that the port has successfully connected.
   *
   * @returns Promise resolving after notifying the port state handler.
   * @private
   */
  private async _notifyPortConnected(): Promise<void> {
    this._wasEverConnected = true;
    if (this._portStateHandler) {
      this._portStateHandler(true, [], undefined);
    }
  }

  /**
   * Notifies listeners that the port has disconnected with reason.
   *
   * @param errorType - Error type category for disconnection (defaults to UnknownError).
   * @param errorMessage - Description of disconnection reason (defaults to 'Port disconnected').
   * @returns Promise resolving after notifying the port state handler.
   * @private
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
      this._portStateHandler(false, Array.from(this._connectedSlaveIds), {
        type: errorType,
        message: errorMessage,
      });
    }
  }

  /**
   * Releases all resources: removes listeners, closes the port, clears buffers and connected devices.
   *
   * @returns Promise resolving when resources are released.
   * @private
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
    this._readBufferHead = 0;
    this._readBufferTail = 0;
    this._readBufferCount = 0;
    this._connectedSlaveIds.clear();
  }

  /**
   * Removes all event listeners from the SerialPort instance.
   *
   * @returns void
   * @private
   */
  private _removeAllListeners(): void {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }
}
