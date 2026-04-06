// modbus/transport/node-transports/node-rtu-emulator.ts

import { ITransport, TRSMode, IRtuEmulatorTransportOptions } from '../../types/modbus-types';
import ModbusSlaveCore from '../../emulator/modbus-slave-core';
import { Logger, pino } from 'pino';
import { crc16Modbus } from '../../utils/crc';

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

  private _responseAdu: Uint8Array | null = null;

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
                translateTime: 'HH:mm:ss',
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
   * Opens the transport (emulator connection).
   * Marks the transport as open and ready to receive requests.
   */
  async connect(): Promise<void> {
    this.isOpen = true;
    this.logger.info('RTU Emulator connected');
  }

  /**
   * Closes the transport (emulator connection).
   * Marks the transport as closed and clears any pending response.
   */
  async disconnect(): Promise<void> {
    this.isOpen = false;
    this._responseAdu = null;
    this.logger.info('RTU Emulator disconnected');
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

    const slaveId = buffer[0];
    const pdu = buffer.subarray(1, buffer.length - 2);

    // --- ЭМУЛЯЦИЯ ЗАДЕРЖКИ ОТВЕТА ---
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
   * Placeholder for device state handler (not used in emulator).
   * Implemented to satisfy the ITransport interface.
   */
  setDeviceStateHandler() {}

  /**
   * Placeholder for port state handler (not used in emulator).
   * Implemented to satisfy the ITransport interface.
   */
  setPortStateHandler() {}

  /**
   * Placeholder method — does nothing in emulator.
   */
  async disableDeviceTracking() {}

  /**
   * Placeholder method — does nothing in emulator.
   */
  async enableDeviceTracking() {}

  /**
   * Placeholder method — does nothing in emulator.
   */
  notifyDeviceConnected() {}

  /**
   * Placeholder method — does nothing in emulator.
   */
  notifyDeviceDisconnected() {}

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
