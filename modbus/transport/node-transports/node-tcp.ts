// modbus/transport/node-transports/node-tcp.ts

import * as net from 'net';
import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import * as utils from '../../utils/utils.js';

import { NodeSerialWriteError, ModbusTimeoutError, ModbusDataConversionError } from '../../errors';

import {
  ITransportTcp,
  INodeTcpTransportOptions,
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
} from '../../types/modbus-types';
import { TrafficSniffer } from '../trackers/TrafficSniffer.js';

const NODE_TCP_CONSTANTS = {
  DEFAULT_PORT: 502,
  DEFAULT_MAX_BUFFER_SIZE: 8192,
  POLL_INTERVAL_MS: 5,
} as const;

/**
 * NodeTcpTransport implements the ITransportTcp interface using Node.js native 'net' module.
 * It manages TCP/IP socket connections to Modbus devices or gateways, providing:
 * - Automatic reconnection logic.
 * - Mutex-protected write operations.
 * - Buffered reading with timeout support.
 * - Real-time tracking of connected/disconnected slave devices.
 */
export default class NodeTcpTransport implements ITransportTcp {
  public isOpen: boolean = false;
  public logger: Logger;

  private host: string;
  private port: number;
  private options: Required<INodeTcpTransportOptions>;
  private socket: net.Socket | null = null;

  private _sniffer: TrafficSniffer | null = null;
  private _waitingForResponse: boolean = false;

  private _readBuffer: Uint8Array;
  private _readBufferHead: number = 0;
  private _readBufferTail: number = 0;
  private _readBufferCount: number = 0;

  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _reconnectTimeout: NodeJS.Timeout | null = null;
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;
  private _operationMutex: Mutex = new Mutex();

  private _connectedSlaveIds: Set<number> = new Set();
  private _deviceStateHandler: TDeviceStateHandler | null = null;
  private _portStateHandler: TPortStateHandler | null = null;
  private _wasEverConnected: boolean = false;

  /**
   * Creates an instance of NodeTcpTransport.
   * @param host - The IP address or hostname of the Modbus device/gateway.
   * @param port - The TCP port (defaults to 502).
   * @param options - Configuration for timeouts, buffer sizes, and reconnection.
   */
  constructor(
    host: string,
    port: number = NODE_TCP_CONSTANTS.DEFAULT_PORT,
    options: INodeTcpTransportOptions = {}
  ) {
    this.host = host;
    this.port = port;

    this.options = {
      readTimeout: options.readTimeout ?? 4000,
      writeTimeout: options.writeTimeout ?? 3000,
      maxBufferSize: options.maxBufferSize ?? NODE_TCP_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
    };

    this._readBuffer = new Uint8Array(this.options.maxBufferSize);

    this.logger = pino({
      level: 'info',
      base: { component: 'Node TCP', host: this.host, port: this.port },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,host,port',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });
  }

  /**
   * Attaches a TrafficSniffer instance to monitor and analyze raw TCP traffic.
   * This allows for sub-millisecond latency tracking and real-time MBAP/PDU inspection.
   * @param sniffer - The TrafficSniffer instance to use for monitoring.
   */
  public setSniffer(sniffer: TrafficSniffer): void {
    this._sniffer = sniffer;
  }

  /**
   * Returns the transport protocol mode.
   * @returns Always returns 'TCP/IP'.
   */
  public getRSMode(): TRSMode {
    return 'TCP/IP';
  }

  /**
   * Sets the callback for device (slave) state changes.
   * @param handler - Function to call when a device connects or disconnects.
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the callback for port (socket) state changes.
   * @param handler - Function to call when the TCP connection state changes.
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Removes the device state handler and stops device tracking.
   */
  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
  }

  /**
   * Enables device tracking and optionally sets a new handler.
   * @param handler - Optional device state handler.
   */
  public async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) this._deviceStateHandler = handler;
  }

  /**
   * Flags a specific Slave ID as connected and notifies the handler.
   * Typically called by the Client after a successful response.
   * @param slaveId - The Modbus unit identifier.
   */
  public notifyDeviceConnected(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, true);
    }
    this.logger.debug(`Device ${slaveId} marked as connected`);
  }

  /**
   * Flags a specific Slave ID as disconnected and notifies the handler.
   * @param slaveId - The Modbus unit identifier.
   * @param errorType - The reason for disconnection.
   * @param errorMessage - Detailed error description.
   */
  public notifyDeviceDisconnected(
    slaveId: number,
    errorType: EConnectionErrorType,
    errorMessage: string
  ): void {
    if (!this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.delete(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, false, { type: errorType, message: errorMessage });
    }
  }

  /**
   * Establishes the TCP connection to the host and port.
   * Sets up event listeners for socket data, errors, and closure.
   * @returns A promise that resolves when the connection is established.
   */
  public async connect(): Promise<void> {
    if (this._isConnecting || this.isOpen) return;

    this._isConnecting = true;
    this._shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.logger.info(`Connecting to ${this.host}:${this.port}...`);

      this.socket = new net.Socket();
      this.socket.setNoDelay(true);
      this.socket.setKeepAlive(true);

      const timeoutHandler = setTimeout(() => {
        this._isConnecting = false;
        reject(new ModbusTimeoutError('TCP Connection timeout'));
      }, 10000);

      this.socket.once('connect', () => {
        clearTimeout(timeoutHandler);
        this.isOpen = true;
        this._isConnecting = false;
        this._reconnectAttempts = 0;
        this._wasEverConnected = true;
        this.logger.info(`SUCCESS: Connected to ${this.host}:${this.port}`);

        this._notifyPortConnected();
        resolve();
      });

      this.socket.on('data', (data: Buffer) => this._onData(data));
      this.socket.on('error', err => this._onError(err));
      this.socket.on('close', () => this._onClose());

      this.socket.connect(this.port, this.host);
    });
  }

  /**
   * Internal handler for incoming socket data.
   * Implements filtering for non-Modbus text noise and manages the read buffer.
   * @param data - Raw buffer received from the socket.
   */
  private _onData(data: Buffer): void {
    if (this._sniffer && this._waitingForResponse && this._readBufferCount === 0) {
      this._sniffer.recordRxStart();
      this._waitingForResponse = false;
    }

    const chunkLen = data.length;
    if (this._readBufferCount + chunkLen > this.options.maxBufferSize) {
      this._readBufferCount = 0;
      this._readBufferHead = 0;
      this._readBufferTail = 0;
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
  }

  /**
   * Internal handler for socket errors.
   * Triggers connection loss logic if the socket was previously open.
   * @param err - The Error object from the socket.
   */
  private _onError(err: Error): void {
    this.logger.error(`Socket error: ${err.message}`);
    if (this.isOpen) {
      this._handleConnectionLoss(err.message);
    }
  }

  /**
   * Internal handler for the socket 'close' event.
   * Updates state, notifies handlers, and schedules reconnection if applicable.
   */
  private _onClose(): void {
    const wasOpen = this.isOpen;
    this.isOpen = false;

    const affectedSlaves = Array.from(this._connectedSlaveIds);

    if (wasOpen) {
      this.logger.warn(`Connection closed for ${this.host}:${this.port}`);
      this._notifyPortDisconnected(
        EConnectionErrorType.PortClosed,
        'Connection closed',
        affectedSlaves
      );
    }

    this._connectedSlaveIds.clear();
    this._readBufferCount = 0;
    this._readBufferHead = 0;
    this._readBufferTail = 0;

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect();
    }
  }

  /**
   * Schedules a reconnection attempt based on the configured interval.
   */
  private _scheduleReconnect(): void {
    if (this._reconnectTimeout || this._reconnectAttempts >= this.options.maxReconnectAttempts)
      return;
    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this.connect().catch(e => this.logger.error(`Reconnect failed: ${e.message}`));
    }, this.options.reconnectInterval);
  }

  /**
   * Notifies the port state handler that a connection has been established.
   */
  private _notifyPortConnected(): void {
    if (this._portStateHandler) {
      this._portStateHandler(true, Array.from(this._connectedSlaveIds), undefined);
    }
  }

  /**
   * Notifies the port state handler about a disconnection.
   * @param errorType - The category of the connection error.
   * @param errorMessage - Descriptive text of the error.
   * @param slaveIds - List of slave IDs that are now unreachable.
   */
  private _notifyPortDisconnected(
    errorType: EConnectionErrorType,
    errorMessage: string,
    slaveIds: number[]
  ): void {
    if (this._portStateHandler) {
      this._portStateHandler(false, slaveIds, { type: errorType, message: errorMessage });
    }
  }

  /**
   * Logic for handling unexpected connection loss.
   * @param reason - Text description of why the connection was lost.
   */
  private _handleConnectionLoss(reason: string): void {
    const affectedSlaves = Array.from(this._connectedSlaveIds);
    this._notifyPortDisconnected(EConnectionErrorType.ConnectionLost, reason, affectedSlaves);
  }

  /**
   * Writes a byte buffer to the TCP socket.
   * Operation is protected by a mutex to ensure sequential access.
   * @param buffer - Data to be sent.
   * @throws NodeSerialWriteError if the socket is closed or writing fails.
   */
  public async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.socket) throw new NodeSerialWriteError('Socket is closed');

    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        if (this._sniffer) {
          this._sniffer.recordTx(`${this.host}:${this.port}`, buffer, 'tcp');
          this._waitingForResponse = true;
        }

        this.socket!.write(Buffer.from(buffer), err => {
          if (err) reject(new NodeSerialWriteError(err.message));
          else resolve();
        });
      });
    } finally {
      release();
    }
  }

  /**
   * Reads a specific number of bytes from the internal buffer.
   * Polls the buffer until the required length is met or the timeout expires.
   * @param length - Number of bytes to read.
   * @param timeout - Maximum time to wait for data (defaults to transport options).
   * @returns A promise resolving to the Uint8Array data.
   * @throws ModbusTimeoutError if data is not received within the specified time.
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
          if (!this.isOpen) return reject(new Error('Transport closed during read'));

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

            if (this._sniffer) {
              this._sniffer.recordRxEnd(`${this.host}:${this.port}`, result, 'tcp');
            }

            return resolve(result);
          }

          if (Date.now() - start > timeout) {
            return reject(new ModbusTimeoutError(`Read timeout after ${timeout}ms`));
          }

          setTimeout(check, NODE_TCP_CONSTANTS.POLL_INTERVAL_MS);
        };
        check();
      });
    } finally {
      release();
    }
  }

  /**
   * Gracefully closes the TCP connection and stops reconnection attempts.
   */
  public async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);

    const affectedSlaves = Array.from(this._connectedSlaveIds);

    return new Promise(resolve => {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
        this.isOpen = false;
        this._notifyPortDisconnected(
          EConnectionErrorType.ManualDisconnect,
          'Manual disconnect',
          affectedSlaves
        );
        this.socket = null;
        this._isDisconnecting = false;
        resolve();
      } else {
        this._isDisconnecting = false;
        resolve();
      }
    });
  }

  /**
   * Clears the current read buffer.
   */
  public async flush(): Promise<void> {
    this._readBufferHead = 0;
    this._readBufferTail = 0;
    this._readBufferCount = 0;
  }

  /**
   * Forcefully destroys the transport, closing sockets and clearing all timeouts.
   */
  destroy(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this.socket) this.socket.destroy();
    this.isOpen = false;
    this.socket = null;
  }
}
