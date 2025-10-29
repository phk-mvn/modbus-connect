import { SerialPort, SerialPortOpenOptions } from 'serialport';
import { Mutex } from 'async-mutex';
import { concatUint8Arrays, sliceUint8Array, allocUint8Array } from '../../utils/utils.js';
import Logger from '../../logger.js';
import {
  ModbusFlushError,
  NodeSerialTransportError,
  NodeSerialConnectionError,
  NodeSerialReadError,
  NodeSerialWriteError,
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
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
  ModbusInterFrameTimeoutError,
  ModbusSilentIntervalError,
} from '../../errors.js';
import {
  Transport,
  NodeSerialTransportOptions,
  DeviceStateHandler,
  ConnectionErrorType,
  PortStateHandler,
} from '../../types/modbus-types.js';
import { DeviceConnectionTracker } from '../trackers/DeviceConnectionTracker.js';
import { PortConnectionTracker } from '../trackers/PortConnectionTracker.js';

// ========== CONSTANTS ==========
const NODE_SERIAL_CONSTANTS = {
  MIN_BAUD_RATE: 300,
  MAX_BAUD_RATE: 115200,
  DEFAULT_MAX_BUFFER_SIZE: 4096,
  POLL_INTERVAL_MS: 10,
} as const;

// ========== LOGGER ==========
const loggerInstance = new Logger();
loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
loggerInstance.setCustomFormatter('logger', (value: unknown) => {
  return typeof value === 'string' ? `[${value}]` : '';
});
const logger = loggerInstance.createLogger('NodeSerialTransport');
logger.setLevel('info');

// ========== ERROR HANDLERS ==========
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
  [ModbusInterFrameTimeoutError.name]: () => logger.error('Inter-frame timeout error detected'),
  [ModbusSilentIntervalError.name]: () => logger.error('Silent interval error detected'),
  [ModbusTooManyEmptyReadsError.name]: () => logger.error('Too many empty reads error detected'),
  [ModbusFlushError.name]: () => logger.error('Flush error detected'),
  [NodeSerialTransportError.name]: () => logger.error('NodeSerial transport error detected'),
  [NodeSerialConnectionError.name]: () => logger.error('NodeSerial connection error detected'),
  [NodeSerialReadError.name]: () => logger.error('NodeSerial read error detected'),
  [NodeSerialWriteError.name]: () => logger.error('NodeSerial write error detected'),
};

const handleModbusError = (err: Error): void => {
  const handler = ERROR_HANDLERS[err.constructor.name];
  if (handler) {
    handler();
  } else {
    logger.error(`Unknown error: ${err.message}`);
  }
};

/**
 * Полная копия WebSerialTransport по трекингу порта и устройств.
 */
class NodeSerialTransport implements Transport {
  private path: string;
  private options: Required<NodeSerialTransportOptions>;
  private port: SerialPort | null = null;
  private readBuffer: Uint8Array = allocUint8Array(0);
  private isOpen: boolean = false;
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

  private readonly connectionTracker = new DeviceConnectionTracker();
  private readonly portConnectionTracker = new PortConnectionTracker({ debounceMs: 300 });

  private _wasEverConnected: boolean = false;

  constructor(port: string, options: NodeSerialTransportOptions = {}) {
    this.path = port;
    this.options = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      readTimeout: 1000,
      writeTimeout: 1000,
      maxBufferSize: NODE_SERIAL_CONSTANTS.DEFAULT_MAX_BUFFER_SIZE,
      reconnectInterval: 3000,
      maxReconnectAttempts: Infinity,
      ...options,
    };
  }

  // === Трекинг устройств ===
  public setDeviceStateHandler(handler: DeviceStateHandler): void {
    this.connectionTracker.setHandler(handler);
  }

  public async disableDeviceTracking(): Promise<void> {
    await this.connectionTracker.removeHandler();
    logger.debug('Device tracking disabled');
  }

  public async enableDeviceTracking(handler?: DeviceStateHandler): Promise<void> {
    if (handler) {
      await this.connectionTracker.setHandler(handler);
    }
    logger.debug('Device tracking enabled');
  }

  public setPortStateHandler(handler: PortStateHandler): void {
    this.portConnectionTracker.setHandler(handler);
  }

  public notifyDeviceConnected(slaveId: number): void {
    this.connectionTracker.notifyConnected(slaveId);
  }

  public notifyDeviceDisconnected(
    slaveId: number,
    errorType?: ConnectionErrorType,
    errorMessage?: string
  ): void {
    this.connectionTracker.notifyDisconnected(slaveId, errorType, errorMessage);
  }

  private async _notifyPortConnected(): Promise<void> {
    this._wasEverConnected = true;
    const slaveIds = await this.connectionTracker.getConnectedSlaveIds();
    this.portConnectionTracker.notifyConnected(slaveIds);
  }

  private async _notifyPortDisconnected(
    errorType: ConnectionErrorType = ConnectionErrorType.UnknownError,
    errorMessage: string = 'Port disconnected'
  ): Promise<void> {
    if (!this._wasEverConnected) {
      logger.debug('Skipping DISCONNECTED — port was never connected');
      return;
    }

    const slaveIds = await this.connectionTracker.getConnectedSlaveIds();
    this.portConnectionTracker.notifyDisconnected(errorType, errorMessage, slaveIds);
  }

  private async _releaseAllResources(): Promise<void> {
    logger.debug('Releasing NodeSerial resources');
    this._removeAllListeners();

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve, reject) => {
        this.port!.close((_err: Error | null) => {
          if (_err) reject(_err);
          else {
            logger.debug('Port closed successfully');
            resolve();
          }
        });
      });
    }

    this.port = null;
    this.isOpen = false;
    this.readBuffer = allocUint8Array(0);
  }

  private _removeAllListeners(): void {
    if (this.port) {
      this.port.removeAllListeners('data');
      this.port.removeAllListeners('error');
      this.port.removeAllListeners('close');
    }
  }

  async connect(): Promise<void> {
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts && !this.isOpen) {
      const error = new NodeSerialConnectionError(
        `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`
      );
      logger.error(`Connection failed: ${error.message}`);
      throw error;
    }

    if (this._isConnecting) {
      logger.warn(`Connection attempt already in progress`);
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
      logger.info(`Serial port ${this.path} opened`);
      await this._notifyPortConnected();

      if (this._resolveConnection) {
        this._resolveConnection();
        this._resolveConnection = null;
        this._rejectConnection = null;
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new NodeSerialTransportError(String(err));
      logger.error(`Failed to open serial port ${this.path}: ${error.message}`);
      this.isOpen = false;

      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(ConnectionErrorType.ConnectionLost, error.message);
      }

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

  private async _createAndOpenPort(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const serialOptions: SerialPortOpenOptions<any> = {
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
          if (_err.message.includes('permission')) {
            reject(new NodeSerialConnectionError('Permission denied'));
          } else if (_err.message.includes('busy')) {
            reject(new NodeSerialConnectionError('Serial port is busy'));
          } else if (_err.message.includes('no such file')) {
            reject(new NodeSerialConnectionError('Serial port does not exist'));
          } else {
            reject(new NodeSerialConnectionError(_err.message));
          }
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
      this.readBuffer = concatUint8Arrays([this.readBuffer, chunk]);
      if (this.readBuffer.length > this.options.maxBufferSize) {
        this.readBuffer = sliceUint8Array(this.readBuffer, -this.options.maxBufferSize);
      }
    } catch (err: unknown) {
      this._handleError(err instanceof Error ? err : new NodeSerialTransportError(String(err)));
    }
  }

  private _onError(err: Error): void {
    logger.error(`Serial port ${this.path} error: ${err.message}`);
    if (err.message.includes('parity')) this._handleError(new ModbusParityError(err.message));
    else if (err.message.includes('frame')) this._handleError(new ModbusFramingError(err.message));
    else if (err.message.includes('overrun'))
      this._handleError(new ModbusOverrunError(err.message));
    else if (err.message.includes('collision'))
      this._handleError(new ModbusCollisionError(err.message));
    else if (err.message.includes('noise')) this._handleError(new ModbusNoiseError(err.message));
    else this._handleError(new NodeSerialTransportError(err.message));
  }

  private _onClose(): void {
    logger.info(`Serial port ${this.path} closed`);
    this.isOpen = false;

    this._notifyPortDisconnected(ConnectionErrorType.PortClosed, 'Port was closed').catch(() => {});

    (async () => {
      const states = await this.connectionTracker.getAllStates();
      for (const state of states) {
        this.connectionTracker.notifyDisconnected(
          state.slaveId,
          ConnectionErrorType.PortClosed,
          'Port was closed'
        );
      }
      this.connectionTracker.clear();
    })();
  }

  private _scheduleReconnect(_err: Error): void {
    if (!this._shouldReconnect || this._isDisconnecting) return;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._reconnectAttempts >= this.options.maxReconnectAttempts) {
      const maxError = new NodeSerialConnectionError(`Max reconnect attempts reached`);
      if (this._rejectConnection) this._rejectConnection(maxError);
      this._shouldReconnect = false;
      (async () => {
        const states = await this.connectionTracker.getAllStates();
        for (const state of states) {
          this.connectionTracker.notifyDisconnected(
            state.slaveId,
            ConnectionErrorType.MaxReconnect,
            maxError.message
          );
        }
        this.connectionTracker.clear();
      })();
      return;
    }
    this._reconnectAttempts++;
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null;
      this._attemptReconnect();
    }, this.options.reconnectInterval);
  }

  private async _attemptReconnect(): Promise<void> {
    try {
      if (this.port && this.port.isOpen) await this._releaseAllResources();
      await this._createAndOpenPort();
      this._reconnectAttempts = 0;
      this.connectionTracker.clear();
      await this._notifyPortConnected();
      if (this._resolveConnection) this._resolveConnection();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new NodeSerialTransportError(String(error));
      this._reconnectAttempts++;
      if (
        this._shouldReconnect &&
        !this._isDisconnecting &&
        this._reconnectAttempts <= this.options.maxReconnectAttempts
      ) {
        this._scheduleReconnect(err);
      } else {
        const maxError = new NodeSerialConnectionError(`Max reconnect attempts reached`);
        if (this._rejectConnection) this._rejectConnection(maxError);
        this._shouldReconnect = false;
        await this._notifyPortDisconnected(ConnectionErrorType.MaxReconnect, maxError.message);
        (async () => {
          const states = await this.connectionTracker.getAllStates();
          for (const state of states) {
            this.connectionTracker.notifyDisconnected(
              state.slaveId,
              ConnectionErrorType.MaxReconnect,
              maxError.message
            );
          }
          this.connectionTracker.clear();
        })();
      }
    }
  }

  async flush(): Promise<void> {
    if (this._isFlushing) {
      await Promise.all(this._pendingFlushPromises.map(p => p())).catch(() => {});
      return;
    }
    this._isFlushing = true;
    const p = new Promise<void>(resolve => this._pendingFlushPromises.push(resolve));
    try {
      this.readBuffer = allocUint8Array(0);
    } finally {
      this._isFlushing = false;
      this._pendingFlushPromises.forEach(r => r());
      this._pendingFlushPromises = [];
    }
    return p;
  }

  async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen || !this.port?.isOpen) throw new NodeSerialWriteError('Port closed');
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

  async read(length: number, timeout: number = this.options.readTimeout): Promise<Uint8Array> {
    if (length <= 0) throw new ModbusDataConversionError(length, 'positive');
    const release = await this._operationMutex.acquire();
    let emptyAttempts = 0;
    const start = Date.now();
    try {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (!this.isOpen || !this.port?.isOpen)
            return reject(new NodeSerialReadError('Port closed'));
          if (this._isFlushing) return reject(new ModbusFlushError());
          if (this.readBuffer.length >= length) {
            const data = sliceUint8Array(this.readBuffer, 0, length);
            this.readBuffer = sliceUint8Array(this.readBuffer, length);
            emptyAttempts = 0;
            if (data.length !== length)
              return reject(new ModbusInsufficientDataError(data.length, length));
            return resolve(data);
          }
          if (this.readBuffer.length === 0) {
            emptyAttempts++;
            if (emptyAttempts >= 3) {
              emptyAttempts = 0;
              this.connect().catch(() => {});
            }
          } else emptyAttempts = 0;
          if (Date.now() - start > timeout) return reject(new ModbusTimeoutError('Read timeout'));
          setTimeout(check, NODE_SERIAL_CONSTANTS.POLL_INTERVAL_MS);
        };
        check();
      });
    } finally {
      release();
    }
  }

  async disconnect(): Promise<void> {
    this._shouldReconnect = false;
    this._isDisconnecting = true;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection)
      this._rejectConnection(new NodeSerialConnectionError('Disconnected'));
    if (!this.isOpen || !this.port) {
      this._isDisconnecting = false;
      if (this._wasEverConnected) {
        await this._notifyPortDisconnected(
          ConnectionErrorType.ManualDisconnect,
          'Port closed by user'
        );
      }
      const states = await this.connectionTracker.getAllStates();
      for (const state of states) {
        this.connectionTracker.notifyDisconnected(
          state.slaveId,
          ConnectionErrorType.ManualDisconnect,
          'Port closed by user'
        );
      }
      this.connectionTracker.clear();
      return;
    }
    await this._releaseAllResources();
    if (this._wasEverConnected) {
      await this._notifyPortDisconnected(
        ConnectionErrorType.ManualDisconnect,
        'Port closed by user'
      );
    }
    const states = await this.connectionTracker.getAllStates();
    for (const state of states) {
      this.connectionTracker.notifyDisconnected(
        state.slaveId,
        ConnectionErrorType.ManualDisconnect,
        'Port closed by user'
      );
    }
    this.connectionTracker.clear();
    this._isDisconnecting = false;
  }

  destroy(): void {
    this._shouldReconnect = false;
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._rejectConnection) this._rejectConnection(new NodeSerialTransportError('Destroyed'));
    this._releaseAllResources().catch(() => {});
    if (this._wasEverConnected) {
      this._notifyPortDisconnected(ConnectionErrorType.Destroyed, 'Transport destroyed').catch(
        () => {}
      );
    }
    (async () => {
      const states = await this.connectionTracker.getAllStates();
      for (const state of states) {
        this.connectionTracker.notifyDisconnected(
          state.slaveId,
          ConnectionErrorType.Destroyed,
          'Transport destroyed'
        );
      }
      this.connectionTracker.clear();
      await this.portConnectionTracker.clear();
    })();
  }

  private _handleError(err: Error): void {
    handleModbusError(err);
    this._handleConnectionLoss(`Error: ${err.message}`);
  }

  private _handleConnectionLoss(reason: string): void {
    if (!this.isOpen && !this._isConnecting) return;

    logger.warn(`Connection loss detected: ${reason}`);
    this.isOpen = false;

    if (this._wasEverConnected) {
      this._notifyPortDisconnected(ConnectionErrorType.ConnectionLost, reason).catch(() => {});
    }

    (async () => {
      const states = await this.connectionTracker.getAllStates();
      for (const state of states) {
        this.connectionTracker.notifyDisconnected(
          state.slaveId,
          ConnectionErrorType.ConnectionLost,
          reason
        );
      }
      this.connectionTracker.clear();
    })();
  }
}

export = NodeSerialTransport;
