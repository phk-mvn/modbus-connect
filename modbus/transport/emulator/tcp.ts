// modbus/transport/emulator/tcp.ts

import {
  ITransport,
  TRSMode,
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  ITcpEmulatorTransportOptions,
  IRegisterDefinitions,
  IInfinityChangeParams,
} from '../../types/public.js';
import ModbusSlaveCore from './slave-core.js';
import { Logger, type ILogObj } from 'tslog';
import { createTsLogger, formatMetaTags } from '../../utils/logger.js';
import { TrafficSniffer } from '../trackers/traffic-sniffer.js';

/**
 * Node.js TCP Emulator Transport.
 *
 * Implements the ITransport interface for emulating a Modbus TCP slave in a Node.js environment.
 * This transport wraps ModbusSlaveCore and adds proper Modbus TCP ADU framing
 * (MBAP Header + PDU).
 *
 * Features:
 * - Simulated network latency
 * - Full Modbus TCP/MBAP header handling
 * - Device and port state notifications via callbacks
 * - Direct access to the underlying slave core
 */
export default class NodeTcpEmulatorTransport implements ITransport {
  public isOpen: boolean = false;
  private core: ModbusSlaveCore;
  private logger: Logger<ILogObj>;
  private responseLatencyMs: number;
  private _pendingResponse: Uint8Array | null = null;
  private _sniffer: TrafficSniffer | null = null;

  private _deviceStateHandler: TDeviceStateHandler | null = null;
  private _portStateHandler: TPortStateHandler | null = null;

  /**
   * Creates a new Modbus TCP Emulator Transport.
   *
   * @param options - Configuration options for the TCP emulator.
   * @param options.slaveId - Modbus slave address (Unit ID) (default: 1).
   * @param options.responseLatencyMs - Simulated network response latency in milliseconds (default: 5).
   * @param options.loggerEnabled - Whether to enable logging (default: true).
   * @param options.deviceIdentification - Optional initial mapping of object IDs to string values for device identification.
   * @param options.initialRegisters - Optional initial register and coil definitions to populate.
   * @param options.RSMode - RS mode (optional, defaults to 'TCP/IP').
   */
  constructor(options: ITcpEmulatorTransportOptions = {}) {
    const slaveId = options.slaveId ?? 1;

    this.core = new ModbusSlaveCore(slaveId, {
      loggerEnabled: options.loggerEnabled ?? true,
      deviceIdentification: options.deviceIdentification,
    });
    this.responseLatencyMs = options.responseLatencyMs ?? 5;

    this.logger = createTsLogger({
      name: 'TCP Emulator',
      bindings: { path: slaveId },
    });

    this.logger.debug('TCP Emulator created');

    if (options.initialRegisters) {
      this.core.addRegisters(options.initialRegisters);
    }

    this.logger.info(`NodeTcpEmulatorTransport created for slaveId ${slaveId}`);
  }

  /**
   * Attaches a TrafficSniffer instance to monitor emulated Modbus TCP traffic.
   *
   * @param sniffer - The TrafficSniffer instance to use for monitoring.
   * @returns void
   */
  public setSniffer(sniffer: TrafficSniffer): void {
    this._sniffer = sniffer;
  }

  /**
   * Establishes the emulator connection (simulated).
   *
   * Sets the transport to open state, triggers port and device state handlers,
   * and logs the connection event.
   *
   * @returns Promise resolving when connection is established.
   */
  async connect(): Promise<void> {
    if (this.isOpen) return;
    await new Promise(r => setTimeout(r, 50));
    this.isOpen = true;

    this.logger.info('TCP Emulator transport connected');
    this._portStateHandler?.(true, [this.core.slaveId]);
    this._deviceStateHandler?.(this.core.slaveId, true);
  }

  /**
   * Closes the emulator connection.
   *
   * Clears any pending response and notifies handlers about the disconnection.
   *
   * @returns Promise resolving when disconnection completes.
   */
  async disconnect(): Promise<void> {
    this.isOpen = false;
    this._pendingResponse = null;
    this.logger.info('TCP Emulator transport disconnected');
    this._deviceStateHandler?.(this.core.slaveId, false, {
      type: EConnectionErrorType.ManualDisconnect,
      message: 'TCP Emulator disconnected',
    });
    this._portStateHandler?.(false, [this.core.slaveId], {
      type: EConnectionErrorType.ManualDisconnect,
      message: 'TCP Emulator disconnected',
    });
  }

  /**
   * Writes a Modbus TCP request (ADU) to the emulator.
   * Parses the MBAP header, validates it, extracts the PDU, processes it through
   * the ModbusSlaveCore, and constructs a proper Modbus TCP response ADU.
   *
   * @param buffer - Complete Modbus TCP ADU (MBAP Header + PDU).
   * @returns Promise resolving when the request has been processed and response buffered.
   * @throws {Error} If the transport is not open.
   */
  async write(buffer: Uint8Array): Promise<void> {
    if (!this.isOpen) throw new Error('TCP Emulator transport is not open');
    if (buffer.length < 8) return;

    if (this._sniffer) {
      this._sniffer.recordTx(`tcp-emulator-${this.core.slaveId}`, buffer);
    }

    const transactionId = (buffer[0] << 8) | buffer[1];
    const protocolId = (buffer[2] << 8) | buffer[3];
    const length = (buffer[4] << 8) | buffer[5];
    const unitId = buffer[6];

    if (protocolId !== 0) {
      this.logger.warn(`${formatMetaTags({ slaveId: unitId })}Invalid Protocol ID: ${protocolId}`);
      return;
    }

    const pdu = buffer.subarray(7, 7 + length - 1);

    if (this.responseLatencyMs > 0) {
      await new Promise(r => setTimeout(r, this.responseLatencyMs));
    }

    const responsePdu = await this.core.processRequest(unitId, pdu);

    // Forming a complete Modbus TCP ADU
    const responseLength = 1 + responsePdu.length;
    const adu = new Uint8Array(6 + responseLength);

    adu[0] = (transactionId >> 8) & 0xff;
    adu[1] = transactionId & 0xff;
    adu[2] = 0;
    adu[3] = 0;
    adu[4] = (responseLength >> 8) & 0xff;
    adu[5] = responseLength & 0xff;
    adu[6] = unitId;
    adu.set(responsePdu, 7);

    this._pendingResponse = adu;
  }

  /**
   * Reads the pending response from the emulator.
   * Waits up to the specified timeout for a response to become available.
   * Returns the full Modbus TCP response ADU when ready.
   *
   * @param length - Expected response length (kept for interface compatibility, not strictly used).
   * @param timeout - Maximum time to wait for response in milliseconds (default: 1000).
   * @returns The complete Modbus TCP response ADU, or an empty Uint8Array if timeout occurs.
   * @throws {Error} If the transport is not open.
   */
  async read(length: number, timeout: number = 1000): Promise<Uint8Array> {
    if (!this.isOpen) throw new Error('TCP Emulator transport is not open');

    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this._pendingResponse) {
        const resp = this._pendingResponse;
        this._pendingResponse = null;

        if (this._sniffer) {
          this._sniffer.recordRxStart();
          this._sniffer.recordRxEnd(`tcp-emulator-${this.core.slaveId}`, resp);
        }

        return resp;
      }
      await new Promise(r => setTimeout(r, 4));
    }

    return new Uint8Array(0);
  }

  /**
   * Flushes any pending response data.
   * Clears the internal pending response buffer.
   *
   * @returns Promise resolving when flush is complete.
   */
  async flush(): Promise<void> {
    this._pendingResponse = null;
  }

  /**
   * Returns the communication mode used by this transport.
   *
   * @returns Always returns 'TCP/IP' for this transport.
   */
  getRSMode(): TRSMode {
    return 'TCP/IP';
  }

  /**
   * Sets the handler for device state changes (connected/disconnected).
   *
   * @param handler - Callback function to be called when device state changes.
   * @returns void
   */
  setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._deviceStateHandler = handler;
  }

  /**
   * Sets the handler for port state changes (open/closed).
   *
   * @param handler - Callback function to be called when port state changes.
   * @returns void
   */
  setPortStateHandler(handler: TPortStateHandler): void {
    this._portStateHandler = handler;
  }

  /**
   * Disables device tracking by removing the device state handler.
   *
   * @returns Promise resolving when device tracking is disabled.
   */
  async disableDeviceTracking(): Promise<void> {
    this._deviceStateHandler = null;
  }

  /**
   * Enables device tracking and optionally sets a new device state handler.
   *
   * @param handler - Optional new device state handler callback.
   * @returns Promise resolving when device tracking is enabled.
   */
  async enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void> {
    if (handler) this._deviceStateHandler = handler;
  }

  /**
   * Notifies that a device has connected.
   *
   * @param slaveId - ID of the connected slave.
   * @returns void
   */
  notifyDeviceConnected(slaveId: number): void {
    this._deviceStateHandler?.(slaveId, true);
  }

  /**
   * Notifies that a device has disconnected with error details.
   *
   * @param slaveId - ID of the disconnected slave.
   * @param errorType - Type of disconnection error.
   * @param errorMessage - Description of the disconnection reason.
   * @returns void
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
   * Allows direct access to core features like register manipulation,
   * exception configuration, and infinity change tasks.
   *
   * @returns The ModbusSlaveCore instance.
   */
  public getCore(): ModbusSlaveCore {
    return this.core;
  }

  /**
   * Convenience method: adds registers to the underlying core.
   *
   * @param defs - Register definitions containing arrays of {start, value} for each memory type.
   * @returns void
   * @see ModbusSlaveCore.addRegisters
   */
  public addRegisters(defs: IRegisterDefinitions): void {
    this.core.addRegisters(defs);
  }

  /**
   * Convenience method: starts infinite value change on a register.
   *
   * @param params - Parameters for the infinite change task.
   * @returns void
   * @see ModbusSlaveCore.infinityChange
   */
  public infinityChange(params: IInfinityChangeParams): void {
    this.core.infinityChange(params);
  }

  /**
   * Convenience method: sets a custom exception for a specific function code and address.
   *
   * @param fc - Modbus function code.
   * @param addr - Register or coil address.
   * @param code - Exception code to return.
   * @returns void
   * @see ModbusSlaveCore.setException
   */
  public setException(fc: number, addr: number, code: number): void {
    this.core.setException(fc, addr, code);
  }
}
