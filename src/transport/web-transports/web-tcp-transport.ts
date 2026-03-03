// src/transport/web-transports/web-tcp-transports.ts

import { Mutex } from 'async-mutex';
import { concatUint8Arrays, sliceUint8Array, allocUint8Array } from '../../utils/utils.js';
import Logger from '../../logger.js';
import { ModbusFlushError, ModbusTimeoutError } from '../../errors.js';
import {
  Transport,
  ConnectionErrorType,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
} from '../../types/modbus-types.js';

export interface WebTcpTransportOptions {
  readTimeout?: number;
  writeTimeout?: number;
  maxBufferSize?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const loggerInstance = new Logger();
const logger = loggerInstance.createLogger('WebTcpTransport');
logger.setLevel('info');

class WebTcpTransport implements Transport {
  public isOpen: boolean = false;

  private url: string;
  private options: Required<WebTcpTransportOptions>;
  private socket: WebSocket | null = null;
  private readBuffer: Uint8Array = allocUint8Array(0);

  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _reconnectTimeout: any = null; // Используем any для совместимости браузер/node
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;
  private _isFlushing: boolean = false;
  private _operationMutex: Mutex = new Mutex();

  private _connectedSlaveIds: Set<number> = new Set();
  private _deviceStateHandler: DeviceStateHandler | null = null;
  private _portStateHandler: PortStateHandler | null = null;
  private _wasEverConnected: boolean = false;

  constructor(url: string, options: WebTcpTransportOptions = {}) {
    this.url = url;
    this.options = {
      readTimeout: options.readTimeout || 2000,
      writeTimeout: options.writeTimeout || 2000,
      maxBufferSize: options.maxBufferSize || 8192,
      reconnectInterval: options.reconnectInterval || 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
    };
  }

  public getRSMode(): RSMode {
    return 'RS485';
  }

  public setDeviceStateHandler(handler: DeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  public setPortStateHandler(handler: PortStateHandler): void {
    this._portStateHandler = handler;
  }

  public async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
  }

  public async enableDeviceTracking(handler?: DeviceStateHandler): Promise<void> {
    if (handler) this._deviceStateHandler = handler;
  }

  public notifyDeviceConnected(slaveId: number): void {
    if (this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.add(slaveId);
    if (this._deviceStateHandler) this._deviceStateHandler(slaveId, true);
  }

  public notifyDeviceDisconnected(
    slaveId: number,
    errorType: ConnectionErrorType,
    errorMessage: string
  ): void {
    if (!this._connectedSlaveIds.has(slaveId)) return;
    this._connectedSlaveIds.delete(slaveId);
    if (this._deviceStateHandler) {
      this._deviceStateHandler(slaveId, false, { type: errorType, message: errorMessage });
    }
  }

  public async connect(): Promise<void> {
    if (this._isConnecting || this.isOpen) return;

    this._isConnecting = true;
    this._shouldReconnect = true;

    return new Promise((resolve, reject) => {
      logger.info(`Connecting to WebSocket Proxy: ${this.url}`);

      try {
        this.socket = new WebSocket(this.url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
          this.isOpen = true;
          this._isConnecting = false;
          this._reconnectAttempts = 0;
          this._wasEverConnected = true;
          logger.info(`WebSocket Connected: ${this.url}`);
          this._notifyPortState(true);
          resolve();
        };

        this.socket.onmessage = event => {
          this._onData(event.data);
        };

        this.socket.onerror = err => {
          logger.error('WebSocket Error', err);
          if (this._isConnecting) {
            this._isConnecting = false;
            reject(new Error('WebSocket connection failed'));
          }
        };

        this.socket.onclose = () => {
          this._onClose();
        };
      } catch (err) {
        this._isConnecting = false;
        reject(err);
      }
    });
  }

  private _onData(data: ArrayBuffer): void {
    const chunk = new Uint8Array(data);
    if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
      this.readBuffer = allocUint8Array(0);
      return;
    }
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);
  }

  private _onClose(): void {
    const wasOpen = this.isOpen;
    this.isOpen = false;

    if (wasOpen) {
      logger.warn(`WebSocket connection closed: ${this.url}`);
      this._notifyPortState(false);
    }

    if (this._shouldReconnect && !this._isDisconnecting) {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnectTimeout || this._reconnectAttempts >= this.options.maxReconnectAttempts)
      return;

    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this.connect().catch(() => {});
    }, this.options.reconnectInterval);
  }

  private _notifyPortState(connected: boolean): void {
    if (this._wasEverConnected && this._portStateHandler) {
      this._portStateHandler(connected, Array.from(this._connectedSlaveIds));
    }
  }

  public async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.socket) throw new Error('WebSocket not open');

    const release = await this._operationMutex.acquire();
    try {
      this.socket.send(buffer);
    } catch (err) {
      throw err;
    } finally {
      release();
    }
  }

  public async read(
    length: number,
    timeout: number = this.options.readTimeout
  ): Promise<Uint8Array> {
    const start = Date.now();
    const release = await this._operationMutex.acquire();

    try {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (this._isFlushing) return reject(new ModbusFlushError());

          if (this.readBuffer.length >= length) {
            const data = sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = sliceUint8Array(this.readBuffer, length);
            return resolve(data);
          }

          if (Date.now() - start > timeout) {
            return reject(new ModbusTimeoutError());
          }

          setTimeout(check, 10);
        };
        check();
      });
    } finally {
      release();
    }
  }

  public async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;

    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isOpen = false;
    this._isDisconnecting = false;
  }

  public async flush(): Promise<void> {
    this._isFlushing = true;
    this.readBuffer = allocUint8Array(0);
    this._isFlushing = false;
  }
}

export default WebTcpTransport;
