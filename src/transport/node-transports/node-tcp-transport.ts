// src/transport/node-transports/node-tcp-transport.ts

import * as net from 'net';
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

interface NodeTcpTransportOptions {
  readTimeout?: number;
  writeTimeout?: number;
  maxBufferSize?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const loggerInstance = new Logger();
const logger = loggerInstance.createLogger('NodeTcpTransport');
logger.setLevel('info');

class NodeTcpTransport implements Transport {
  public isOpen: boolean = false;
  private host: string;
  private port: number;
  private options: Required<NodeTcpTransportOptions>;
  private socket: net.Socket | null = null;
  private readBuffer: Uint8Array = allocUint8Array(0);

  private _reconnectAttempts: number = 0;
  private _shouldReconnect: boolean = true;
  private _reconnectTimeout: NodeJS.Timeout | null = null;
  private _isConnecting: boolean = false;
  private _isDisconnecting: boolean = false;
  private _isFlushing: boolean = false;
  private _operationMutex: Mutex = new Mutex();

  private _connectedSlaveIds: Set<number> = new Set();
  private _deviceStateHandler: DeviceStateHandler | null = null;
  private _portStateHandler: PortStateHandler | null = null;
  private _wasEverConnected: boolean = false;

  constructor(host: string, port: number, options: NodeTcpTransportOptions = {}) {
    this.host = host;
    this.port = port;
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
  public setDeviceStateHandler(h: DeviceStateHandler) {
    this._deviceStateHandler = h;
  }
  public setPortStateHandler(h: PortStateHandler) {
    this._portStateHandler = h;
  }
  public async disableDeviceTracking() {
    this._deviceStateHandler = null;
  }
  public async enableDeviceTracking(h?: DeviceStateHandler) {
    if (h) this._deviceStateHandler = h;
  }

  public notifyDeviceConnected(id: number) {
    if (this._connectedSlaveIds.has(id)) return;
    this._connectedSlaveIds.add(id);
    this._deviceStateHandler?.(id, true);
  }

  public notifyDeviceDisconnected(id: number, type: ConnectionErrorType, msg: string) {
    if (!this._connectedSlaveIds.has(id)) return;
    this._connectedSlaveIds.delete(id);
    this._deviceStateHandler?.(id, false, { type, message: msg });
  }

  public async connect(): Promise<void> {
    if (this._isConnecting || this.isOpen) return;
    this._isConnecting = true;
    this._shouldReconnect = true;

    return new Promise((resolve, reject) => {
      logger.info(`Connecting to ${this.host}:${this.port}...`);

      this.socket = net.connect({ host: this.host, port: this.port }, () => {
        this.isOpen = true;
        this._isConnecting = false;
        this._reconnectAttempts = 0;
        this._wasEverConnected = true;
        this.socket?.setNoDelay(true); // Отключаем задержки пакетов
        logger.info(`SUCCESS: Connected to ${this.host}:${this.port}`);
        this._notifyPortState(true);
        resolve();
      });

      this.socket.on('data', (data: Buffer | string) => {
        // Преобразуем в Buffer, если пришла строка (хотя для Modbus это редкость)
        const buffer = typeof data === 'string' ? Buffer.from(data, 'hex') : data;

        console.log(
          `\x1b[32m>>> RAW DATA RECEIVED (${buffer.length} bytes): ${buffer.toString('hex')}\x1b[0m`
        );
        this._onData(buffer);
      });

      this.socket.on('error', err => {
        if (this._isConnecting) {
          this._isConnecting = false;
          reject(err);
        }
        this._onError(err);
      });

      this.socket.on('close', () => this._onClose());
      this.socket.setTimeout(this.options.readTimeout);
      this.socket.on('timeout', () => {
        if (this._isConnecting) {
          this.socket?.destroy();
          reject(new ModbusTimeoutError('TCP Connection timeout'));
        }
      });
    });
  }

  private _onData(data: Buffer | Uint8Array): void {
    const chunk = new Uint8Array(data);
    if (this.readBuffer.length + chunk.length > this.options.maxBufferSize) {
      this.readBuffer = allocUint8Array(0);
      return;
    }
    this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);
  }

  private _onError(err: Error): void {
    logger.error(`Socket error: ${err.message}`);
    this._handleConnectionLoss(err.message);
  }

  private _onClose(): void {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen) {
      logger.warn(`Connection closed for ${this.host}:${this.port}`);
      this._notifyPortState(false);
    }
    if (this._shouldReconnect && !this._isDisconnecting) this._scheduleReconnect();
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

  private _handleConnectionLoss(reason: string): void {
    this._deviceStateHandler?.(0, false, {
      type: ConnectionErrorType.ConnectionLost,
      message: reason,
    });
    this._connectedSlaveIds.clear();
  }

  public async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.socket) throw new Error('Transport not open');
    const release = await this._operationMutex.acquire();
    try {
      return new Promise((resolve, reject) => {
        // ЛОГ ОТПРАВКИ
        console.log(`\x1b[33m<<< RAW DATA SEND: ${Buffer.from(buffer).toString('hex')}\x1b[0m`);
        this.socket!.write(Buffer.from(buffer), err => {
          if (err) reject(err);
          else resolve();
        });
      });
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
          if (Date.now() - start > timeout) return reject(new ModbusTimeoutError());
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
    return new Promise(resolve => {
      if (this.socket) {
        this.socket.end(() => {
          this.isOpen = false;
          this.socket = null;
          resolve();
        });
      } else resolve();
    });
  }

  public async flush(): Promise<void> {
    this.readBuffer = allocUint8Array(0);
  }
}

export = NodeTcpTransport;
