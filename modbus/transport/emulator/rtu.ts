// modbus/transport/emulator/rtu.ts

import {
  ITransport,
  TRSMode,
  IRtuEmulatorTransportOptions,
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
} from '../../types/public.js';
import ModbusSlaveCore from './slave-core.js';
import { Logger, pino } from 'pino';
import { crc16Modbus } from '../../utils/crc.js';
import { TrafficSniffer } from '../trackers/traffic-sniffer.js';

/**
 * Node.js RTU Emulator Transport.
 *
 * This class implements the ITransport interface for emulating a Modbus RTU slave
 * in a Node.js environment. It wraps the ModbusSlaveCore and adds RTU-specific
 * framing (Slave ID + PDU + CRC16).
 *
 * It simulates real-world RTU behavior including response latency and proper ADU formatting.
 */
export default class NodeRtuEmulatorTransport implements ITransport {
  public isOpen: boolean = false;
  private core: ModbusSlaveCore;
  private logger: Logger;
  private responseLatencyMs: number;
  private _sniffer: TrafficSniffer | null = null;
  private _responseAdu: Uint8Array | null = null;

  private _deviceStateHandler: TDeviceStateHandler | null = null;
  private _portStateHandler: TPortStateHandler | null = null;

  /**
   * Creates a new Node.js RTU Emulator Transport.
   * @param options - Configuration options for the RTU emulator transport
   * @param options.slaveId - Modbus slave ID (passed to ModbusSlaveCore). Default: 1
   * @param options.loggerEnabled - Enable/disable logging. Default: true
   * @param options.responseLatencyMs - Simulated response delay in milliseconds. Default: 30
   * @param options.initialRegisters - Initial register values to load into the slave core
   */
  constructor(options: IRtuEmulatorTransportOptions = {}) {
    const slaveId = options.slaveId ?? 1;
    this.core = new ModbusSlaveCore(slaveId, { loggerEnabled: options.loggerEnabled ?? true });

    this.responseLatencyMs = options.responseLatencyMs ?? 30;

    this.logger = pino({
      level: 'info',
      base: { component: 'RTU Emulator', path: slaveId },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,path',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    this.logger.debug('RTU Emulator created');

    if (options.initialRegisters) {
      this.core.addRegisters(options.initialRegisters);
    }
  }

  /**
   * Attaches a TrafficSniffer instance to monitor emulated Modbus RTU traffic.
   * This allows for real-time analysis of emulated requests and responses.
   * @param sniffer - The TrafficSniffer instance to use for monitoring.
   */
  public setSniffer(sniffer: TrafficSniffer): void {
    this._sniffer = sniffer;
  }

  /**
   * Opens the transport (emulator connection).
   * Marks the transport as open and ready to receive requests.
   */
  async connect(): Promise<void> {
    this.isOpen = true;
    this.logger.info('RTU Emulator connected');
    this._portStateHandler?.(true, [this.core.slaveId]);
    this._deviceStateHandler?.(this.core.slaveId, true);
  }

  /**
   * Closes the transport (emulator connection).
   * Marks the transport as closed and clears any pending response.
   */
  async disconnect(): Promise<void> {
    this.isOpen = false;
    this._responseAdu = null;
    this.logger.info('RTU Emulator disconnected');
    this._deviceStateHandler?.(this.core.slaveId, false, {
      type: EConnectionErrorType.ManualDisconnect,
      message: 'RTU Emulator disconnected',
    });
    this._portStateHandler?.(false, [this.core.slaveId], {
      type: EConnectionErrorType.ManualDisconnect,
      message: 'RTU Emulator disconnected',
    });
  }

  /**
   * Writes a Modbus RTU ADU (Application Data Unit) to the emulator.
   * Parses the incoming RTU frame, extracts Slave ID and PDU, processes it through
   * the ModbusSlaveCore, adds CRC16, and prepares the response.
   * @param buffer - Complete Modbus RTU request frame (Slave ID + PDU + CRC)
   * @throws {Error} If transport is not open or frame is too short
   */
  async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen) throw new Error('Not open');
    if (buffer.length < 4) return;

    if (this._sniffer) {
      this._sniffer.recordTx(`emulator-${this.core.slaveId}`, buffer);
    }

    const slaveId = buffer[0];
    const pdu = buffer.subarray(1, buffer.length - 2);

    // --- RESPONSE DELAY EMULATION ---
    if (this.responseLatencyMs > 0) {
      await new Promise(r => setTimeout(r, this.responseLatencyMs));
    }

    try {
      const responsePdu = await this.core.processRequest(slaveId, pdu);

      const adu = new Uint8Array(1 + responsePdu.length + 2);
      adu[0] = slaveId;
      adu.set(responsePdu, 1);

      const crc = crc16Modbus(adu.subarray(0, 1 + responsePdu.length));
      adu.set(crc, 1 + responsePdu.length);

      this._responseAdu = adu;
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  /**
   * Reads the response from the emulator.
   * Returns the prepared response ADU if available, otherwise returns an empty buffer
   * after a short delay (to simulate asynchronous behavior).
   * @param length - Expected response length (not used in emulator, kept for interface compatibility)
   * @param timeout - Read timeout in milliseconds (not used in this emulator)
   * @returns The full Modbus RTU response ADU or empty Uint8Array if no response is ready
   * @throws {Error} If transport is not open
   */
  async read(length: number, timeout: number = 1000): Promise<Uint8Array> {
    if (!this.isOpen) throw new Error('Not open');

    if (this._responseAdu) {
      const resp = this._responseAdu;
      this._responseAdu = null;

      if (this._sniffer) {
        this._sniffer.recordRxStart();
        this._sniffer.recordRxEnd(`emulator-${this.core.slaveId}`, resp);
      }

      return resp;
    }

    await new Promise(r => setTimeout(r, 30));
    return new Uint8Array(0);
  }

  /**
   * Flushes any pending response data.
   * Clears the internal response buffer.
   */
  async flush(): Promise<void> {
    this._responseAdu = null;
  }

  /**
   * Returns the RS mode used by this transport.
   * @returns Always returns 'RS485' for RTU emulator
   */
  getRSMode(): TRSMode {
    return 'RS485';
  }

  /**
   * Sets the handler for device state changes (connected/disconnected).
   * @param handler - Callback function to be called when device state changes
   */
  setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the handler for port state changes (open/closed).
   * @param handler - Callback function to be called when port state changes
   */
  setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables device tracking by removing the device state handler.
   */
  async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
  }

  /**
   * Enables device tracking and optionally sets a new device state handler.
   * @param handler - Optional new device state handler
   */
  async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) this._deviceStateHandler = handler;
  }

  /**
   * Notifies that a device has connected.
   * @param slaveId - ID of the connected slave
   */
  notifyDeviceConnected(slaveId: number): void {
    this._deviceStateHandler?.(slaveId, true);
  }

  /**
   * Notifies that a device has disconnected with error details.
   * @param slaveId - ID of the disconnected slave
   * @param errorType - Type of disconnection error
   * @param errorMessage - Description of the disconnection reason
   */
  notifyDeviceDisconnected(
    slaveId: number,
    errorType: EConnectionErrorType,
    errorMessage: string
  ): void {
    this._deviceStateHandler?.(slaveId, false, { type: errorType, message: errorMessage });
  }

  /**
   * Returns the underlying ModbusSlaveCore instance.
   * Useful for direct access to core functionality such as:
   * - Adding registers
   * - Setting exceptions
   * - Starting/stopping infinity change tasks
   * @returns The ModbusSlaveCore instance used by this transport
   */
  public getCore() {
    return this.core;
  }
}
