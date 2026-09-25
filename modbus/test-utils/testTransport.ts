// modbus/test-utils/testTransport.ts
//
// Test-only fake ITransport for deterministic unit tests.
// It never touches hardware: responses, timeouts, CRC corruption and line drops are
// controlled directly from the test. This file is NOT exported from any package entry
// point and is excluded from the published package (see .npmignore).

import {
  EConnectionErrorType,
  ITransport,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
} from '../types/public.js';
import {
  ModbusDataConversionError,
  ModbusNotConnectedError,
  ModbusTimeoutError,
} from '../core/errors.js';

/** Construction options for the fake transport. */
export interface ITestTransportOptions {
  /** Default timeout used by read() when the caller does not pass one (default 1000ms). */
  readTimeout?: number;
  /** RS mode reported by getRSMode() (default 'RS485'). */
  rsMode?: TRSMode;
  /** Port path used for logging/journal identification (default 'test-port'). */
  path?: string;
}

export type TTestJournalOp = 'write' | 'read' | 'flush';

/** A single wire-level event captured for assertions. */
export interface ITestJournalEntry {
  op: TTestJournalOp;
  data?: Uint8Array;
  ts: number;
}

type TTestReadSource =
  | { kind: 'bytes'; data: Uint8Array }
  | { kind: 'timeout' }
  | {
      kind: 'provider';
      fn: (lastWrite: Uint8Array | undefined, length: number) => Uint8Array | Promise<Uint8Array>;
    };

/** Physical line control used to simulate a broken / restored connection. */
export interface ITestConnectionControl {
  /** Simulate a physical line drop: subsequent read()/write() fail. */
  shouldDrop(): void;
  /** Restore the line after a drop. */
  shouldRecover(): void;
  isDropped(): boolean;
}

/** Fake ITransport plus the controls a test needs. */
export interface ITestTransport extends ITransport {
  readonly path: string;
  /** Wire-level event journal (write/read/flush), used for atomicity assertions. */
  readonly journal: ITestJournalEntry[];
  readonly connection: ITestConnectionControl;
  /** Outgoing frame interceptor: called for every write() with the raw request frame. */
  onWrite?: (buffer: Uint8Array) => void;

  /** Next read() will return exactly this frame (extra bytes stay buffered for later reads). */
  queueResponse(buffer: Uint8Array): void;
  /** Next read() rejects immediately with ModbusTimeoutError (silent / broken line). */
  queueTimeout(): void;
  /**
   * Next read() returns a frame of valid length but with a corrupted CRC.
   * When no buffer is given, the last written frame is echoed back corrupted.
   */
  queueCrcError(buffer?: Uint8Array): void;
  /** Arbitrary async response provider; receives the last written frame and the requested length. */
  queueRawAsync(
    fn: (lastWrite: Uint8Array | undefined, length: number) => Uint8Array | Promise<Uint8Array>
  ): void;

  getActiveReadCount(): number;
  getBufferedLength(): number;
  getLastWrite(): Uint8Array | undefined;
  /** Throws when at least one read() is currently in flight (queue atomicity invariant). */
  assertIdle(): void;
  resetJournal(): void;
  /** Clears buffered bytes, queued sources and the journal. */
  reset(): void;
}

/**
 * Creates a fake transport for deterministic queue / protocol unit tests.
 */
class TestTransport implements ITestTransport {
  public readonly path: string;
  public readonly journal: ITestJournalEntry[] = [];
  public onWrite?: (buffer: Uint8Array) => void;

  private readonly _readTimeout: number;
  private readonly _rsMode: TRSMode;
  private readonly _rxBytes: number[] = [];
  private readonly _sources: TTestReadSource[] = [];
  private _activeReads = 0;
  private _lastWrite?: Uint8Array;
  private _dropped = false;
  private _isOpen = false;

  private _deviceStateHandler?: TDeviceStateHandler;
  private _portStateHandler?: TPortStateHandler;
  private _sniffer?: unknown;

  public readonly connection: ITestConnectionControl;

  constructor(options: ITestTransportOptions = {}) {
    this.path = options.path ?? 'test-port';
    this._readTimeout = options.readTimeout ?? 1000;
    this._rsMode = options.rsMode ?? 'RS485';
    this.connection = {
      shouldDrop: () => {
        this._dropped = true;
      },
      shouldRecover: () => {
        this._dropped = false;
      },
      isDropped: () => this._dropped,
    };
  }

  /**
   * Indicates whether the transport is currently open (connect() called and not yet disconnect()).
   * @returns {boolean} True if the transport is open, false otherwise.
   */
  public get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Opens the transport, allowing read/write operations to proceed.
   * @returns {Promise<void>} Resolves when the transport is successfully opened.
   */
  public async connect(): Promise<void> {
    this._isOpen = true;
    this._dropped = false;
  }

  /**
   * Closes the transport, preventing further read/write operations.
   * @returns {Promise<void>} Resolves when the transport is successfully closed.
   */
  public async disconnect(): Promise<void> {
    this._isOpen = false;
  }

  /** Writes a buffer to the transport, simulating a Modbus request.
   * @param {Uint8Array} buffer - The buffer to write.
   * @returns {Promise<void>} Resolves when the write operation is complete.
   * @throws {ModbusNotConnectedError} If the transport is dropped or not open.
   */
  public async write(buffer: Uint8Array): Promise<void> {
    this._assertLineAlive();
    const copy = Uint8Array.from(buffer);
    this._lastWrite = copy;
    this.journal.push({ op: 'write', data: copy, ts: Date.now() });
    if (this.onWrite) this.onWrite(copy);
  }

  /** Reads a specified number of bytes from the transport, simulating a Modbus response.
   * @param {number} length - The number of bytes to read.
   * @param {number} [timeout] - Optional timeout in milliseconds for the read operation.
   * @returns {Promise<Uint8Array>} Resolves with the read bytes.
   * @throws {ModbusTimeoutError} If no data is received within the specified timeout.
   * @throws {ModbusNotConnectedError} If the transport is dropped or not open.
   */
  public async read(length: number, timeout?: number): Promise<Uint8Array> {
    if (length <= 0) throw new ModbusDataConversionError(length, 'positive');
    this._assertLineAlive();

    const effectiveTimeout = timeout ?? this._readTimeout;
    const deadline = Date.now() + effectiveTimeout;
    this._activeReads++;

    try {
      while (this._rxBytes.length < length) {
        const source = this._sources.shift();

        if (!source) {
          // Device is silent: simulate "no data received" up to the timeout.
          const remaining = deadline - Date.now();
          if (remaining > 0) await new Promise<void>(resolve => setTimeout(resolve, remaining));
          throw new ModbusTimeoutError(
            `Read timeout: No data received within ${effectiveTimeout}ms`
          );
        }

        if (source.kind === 'timeout') {
          throw new ModbusTimeoutError(
            `Read timeout: No data received within ${effectiveTimeout}ms`
          );
        }

        const data =
          source.kind === 'bytes' ? source.data : await source.fn(this._lastWrite, length);
        for (const byte of data) this._rxBytes.push(byte);
      }

      const result = Uint8Array.from(this._rxBytes.splice(0, length));
      this.journal.push({ op: 'read', data: result, ts: Date.now() });
      return result;
    } finally {
      this._activeReads--;
    }
  }

  /** Clears the transport's receive buffer, discarding any unread bytes.
   * @returns {Promise<void>} Resolves when the flush operation is complete.
   */
  public async flush(): Promise<void> {
    this._rxBytes.length = 0;
    this.journal.push({ op: 'flush', ts: Date.now() });
  }

  /** Returns the RS mode of the transport (RS485, RS232, or TCP/IP).
   * @returns {TRSMode} The RS mode of the transport.
   */
  public getRSMode(): TRSMode {
    return this._rsMode;
  }

  /** Sets a handler to be called when the device state changes (connected/disconnected).
   * @param {TDeviceStateHandler} handler - The handler function to set.
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /** Sets a handler to be called when the port state changes (open/closed).
   * @param {TPortStateHandler} handler - The handler function to set.
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables device tracking, preventing the transport from notifying about device connections/disconnections.
   * @returns {Promise<void>} Resolves when device tracking is disabled.
   */
  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = undefined;
  }

  /** Enables device tracking, allowing the transport to notify about device connections/disconnections.
   * @param {TDeviceStateHandler} [handler] - Optional handler function to set for device state changes.
   * @returns {Promise<void>} Resolves when device tracking is enabled.
   */
  public async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) this._deviceStateHandler = handler;
  }

  /** Notifies the transport that a device has connected.
   * @param {number} slaveId - The ID of the connected device.
   */
  public notifyDeviceConnected(_slaveId: number): void {
    // No-op: connection tracking belongs to later phases.
  }

  /** Notifies the transport that a device has disconnected.
   * @param {number} slaveId - The ID of the disconnected device.
   * @param {EConnectionErrorType} errorType - The type of error that caused the disconnection.
   * @param {string} [errorMessage] - Optional error message providing additional context.
   */
  public notifyDeviceDisconnected(
    _slaveId: number,
    _errorType: EConnectionErrorType,
    _errorMessage?: string
  ): void {
    // No-op: connection tracking belongs to later phases.
  }

  /** Sets a sniffer for monitoring raw data traffic on the transport.
   * @param {unknown} sniffer - The sniffer object to set.
   */
  public setSniffer(sniffer: unknown): void {
    this._sniffer = sniffer;
  }

  /** Queues a response frame to be returned by the next read() call.
   * @param {Uint8Array} buffer - The response frame to queue.
   */
  public queueResponse(buffer: Uint8Array): void {
    this._sources.push({ kind: 'bytes', data: Uint8Array.from(buffer) });
  }

  /** Queues a timeout for the next read() call, simulating a silent device.
   * The read() will reject with a ModbusTimeoutError after the configured timeout.
   */
  public queueTimeout(): void {
    this._sources.push({ kind: 'timeout' });
  }

  /** Queues a response frame with a corrupted CRC for the next read() call.
   * If no buffer is provided, the last written frame is echoed back with a corrupted CRC.
   * @param {Uint8Array} [buffer] - Optional buffer to corrupt; if omitted, the last written frame is used.
   * @throws {Error} If no buffer is provided and there is no previous write() to corrupt.
   * @throws {Error} If the provided buffer has fewer than 2 bytes (cannot corrupt CRC).
   */
  public queueCrcError(buffer?: Uint8Array): void {
    const base = buffer ?? this._lastWrite;
    if (!base) {
      throw new Error('queueCrcError() requires a buffer or a previous write() to corrupt');
    }
    if (base.length < 2) {
      throw new Error('queueCrcError() requires a frame with at least 2 bytes');
    }
    const corrupted = Uint8Array.from(base);
    corrupted[corrupted.length - 1] ^= 0xff;
    corrupted[corrupted.length - 2] ^= 0xff;
    this._sources.push({ kind: 'bytes', data: corrupted });
  }

  /** Queues an arbitrary async response provider for the next read() call.
   * The provided function receives the last written frame and the requested length, and can return
   * a Uint8Array or a Promise that resolves to a Uint8Array. This allows for dynamic response generation.
   * @param {function} fn - The async function that generates the response.
   */
  public queueRawAsync(
    fn: (lastWrite: Uint8Array | undefined, length: number) => Uint8Array | Promise<Uint8Array>
  ): void {
    this._sources.push({ kind: 'provider', fn });
  }

  /** Returns the number of read() calls currently in flight (active reads).
   * @returns {number} The count of active read() calls.
   */
  public getActiveReadCount(): number {
    return this._activeReads;
  }

  /** Returns the number of bytes currently buffered for reading (queued responses).
   * @returns {number} The count of buffered bytes available for read().
   */
  public getBufferedLength(): number {
    return this._rxBytes.length;
  }

  /** Returns the last written frame, or undefined if no write() has occurred yet.
   * @returns {Uint8Array | undefined} The last written frame, or undefined if none.
   */
  public getLastWrite(): Uint8Array | undefined {
    return this._lastWrite;
  }

  /** Asserts that there are no active read() calls in flight.
   * Throws an error if there is at least one active read(), indicating that the transport is not idle.
   * This is useful for ensuring atomicity in tests where reads and writes should not overlap.
   * @throws {Error} If there is at least one active read() call.
   */
  public assertIdle(): void {
    if (this._activeReads > 0) {
      throw new Error(`Test transport is not idle: ${this._activeReads} active read(s)`);
    }
  }

  /** Resets the journal of wire-level events, clearing all recorded write/read/flush operations.
   * This is useful for isolating test cases and ensuring that only relevant events are captured.
   */
  public resetJournal(): void {
    this.journal.length = 0;
  }

  /** Resets the transport state, clearing buffered bytes, queued sources, and the journal.
   * This is useful for starting a new test case with a clean transport state.
   */
  public reset(): void {
    this._rxBytes.length = 0;
    this._sources.length = 0;
    this._activeReads = 0;
    this._lastWrite = undefined;
    this._dropped = false;
    this.journal.length = 0;
  }

  private _assertLineAlive(): void {
    if (this._dropped) {
      throw new ModbusNotConnectedError();
    }
  }
}

/** Creates a fake transport for deterministic queue / protocol unit tests. */
export function createTestTransport(options: ITestTransportOptions = {}): ITestTransport {
  return new TestTransport(options);
}
