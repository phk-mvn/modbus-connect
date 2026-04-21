// modbus/utils/scanner.ts

import { Logger } from 'pino';
import { TransportFactory } from '../transport/factory.js';
import { ModbusProtocol } from '../core/protocol.js';
import { RtuFramer, TcpFramer } from '../protocol/framing.js';
import { buildReadHoldingRegistersRequest } from '../protocol/functions.js';
import { IScanOptions, IScanResult, IScanController } from '../types/public.js';
import { ModbusExceptionError } from '../core/errors.js';

/**
 * Provides state management for the scanning process,
 * allowing for external control such as pausing or stopping.
 */
export class ScanController implements IScanController {
  private _isPaused: boolean = false;
  private _isStopped: boolean = false;

  /**
   * Pauses the scanning process at the next available iteration.
   */
  public pause(): void {
    this._isPaused = true;
  }

  /**
   * Resumes a previously paused scanning process.
   */
  public resume(): void {
    this._isPaused = false;
  }

  /**
   * Immediately stops the scanning process and releases resources.
   */
  public stop(): void {
    this._isStopped = true;
  }

  /**
   * Returns true if the scanner is currently paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Returns true if the scanner has been stopped.
   */
  get isStopped(): boolean {
    return this._isStopped;
  }
}

/**
 * High-performance Modbus scanner designed to discover devices on RTU and TCP networks.
 * Uses adaptive mathematical timeouts to achieve maximum discovery speed.
 */
export class ModbusScanner {
  /**
   * Creates an instance of ModbusScanner.
   * @param logger - Pino logger instance for internal diagnostics.
   */
  constructor(private logger: Logger) {}

  /**
   * Scans a serial (RTU) line for Modbus devices across multiple baud rates and parities.
   * Uses a mathematical formula to determine the minimum safe timeout for each speed.
   *
   * @param options - Configuration options including path, bauds, parities, and slave IDs.
   * @param transportType - The type of transport to use ('node-rtu' or 'web-rtu').
   * @param ctrl - Controller instance to manage scan lifecycle (pause/stop).
   * @returns A promise resolving to an array of discovered devices.
   */
  public async scanRtu(
    options: IScanOptions,
    transportType: 'node-rtu' | 'web-rtu',
    ctrl: IScanController
  ): Promise<IScanResult[]> {
    const results: IScanResult[] = [];
    const bauds = options.bauds || [115200, 57600, 38400, 19200, 9600];
    const parities = options.parities || ['none', 'even', 'odd'];
    const slaveIds = options.slaveIds || Array.from({ length: 247 }, (_, i) => i + 1);
    const address = options.registerAddress ?? 0;
    const pdu = buildReadHoldingRegistersRequest(address, 1);
    const foundIds = new Set<number>();

    for (const baud of bauds) {
      if (ctrl.isStopped) break;
      for (const parity of parities) {
        if (ctrl.isStopped) break;

        // TIMEOUT: (11 bits * 24 chars) / baud + 5ms system latency padding
        const timeout = Math.ceil(264000 / baud + 5);

        let transport: any = null;
        try {
          transport = await TransportFactory.create(
            transportType,
            {
              port: options.path,
              baudRate: baud,
              parity: parity,
              RSMode: 'RS485',
            },
            this.logger
          );

          await transport.connect();
          const protocol = new ModbusProtocol(transport, RtuFramer);

          for (let i = 0; i < slaveIds.length; i++) {
            if (ctrl.isStopped) break;
            while (ctrl.isPaused) {
              await new Promise(r => setTimeout(r, 50));
              if (ctrl.isStopped) break;
            }

            const slaveId = slaveIds[i];
            options.onProgress?.(i + 1, slaveIds.length, { baud, parity, slaveId });

            try {
              await protocol.exchange(slaveId, pdu, timeout);
              this._add(
                results,
                foundIds,
                transportType,
                slaveId,
                baud,
                parity,
                options.path,
                options
              );
            } catch (err: any) {
              if (err instanceof ModbusExceptionError) {
                this._add(
                  results,
                  foundIds,
                  transportType,
                  slaveId,
                  baud,
                  parity,
                  options.path,
                  options
                );
              }
            }
          }
        } finally {
          if (transport) await transport.disconnect();
        }
      }
    }
    options.onFinish?.(results);
    return results;
  }

  /**
   * Scans a TCP network for Modbus devices using high-concurrency parallel requests.
   *
   * @param options - Configuration options including hosts, ports, and unit IDs.
   * @param ctrl - Controller instance to manage scan lifecycle.
   * @returns A promise resolving to an array of discovered TCP devices.
   */
  public async scanTcp(options: IScanOptions, ctrl: IScanController): Promise<IScanResult[]> {
    const results: IScanResult[] = [];
    const hosts = options.hosts || ['127.0.0.1'];
    const ports = options.ports || [502];
    const unitIds = options.unitIds || Array.from({ length: 247 }, (_, i) => i + 1);
    const concurrency = 50;
    const pdu = buildReadHoldingRegistersRequest(options.registerAddress ?? 0, 1);

    for (const host of hosts) {
      if (ctrl.isStopped) break;
      for (const port of ports) {
        if (ctrl.isStopped) break;
        let transport: any = null;
        try {
          transport = await TransportFactory.create('node-tcp', { host, port }, this.logger);
          await transport.connect();
          const protocol = new ModbusProtocol(transport, TcpFramer);

          for (let i = 0; i < unitIds.length; i += concurrency) {
            if (ctrl.isStopped) break;
            while (ctrl.isPaused) await new Promise(r => setTimeout(r, 50));

            const chunk = unitIds.slice(i, i + concurrency);
            await Promise.all(
              chunk.map(async unitId => {
                try {
                  await protocol.exchange(unitId, pdu, 250);
                  this._addTcp(results, unitId, host, port, options);
                } catch (err) {
                  if (err instanceof ModbusExceptionError) {
                    this._addTcp(results, unitId, host, port, options);
                  }
                }
              })
            );
            options.onProgress?.(Math.min(i + concurrency, unitIds.length), unitIds.length, {
              host,
              port,
            });
          }
        } finally {
          if (transport) await transport.disconnect();
        }
      }
    }
    options.onFinish?.(results);
    return results;
  }

  /**
   * Internal helper to register a discovered RTU device and trigger callbacks.
   * Ensures duplicate IDs across different parities are ignored once discovered.
   */
  private _add(
    res: IScanResult[],
    set: Set<number>,
    type: any,
    sid: number,
    baud: number,
    parity: any,
    path: any,
    opts: IScanOptions
  ) {
    if (set.has(sid)) return;
    set.add(sid);
    const device: IScanResult = {
      type,
      slaveId: sid,
      baudRate: baud,
      parity,
      port: path,
      stopBits: parity === 'none' ? 2 : 1,
    };
    res.push(device);
    opts.onDeviceFound?.(device);
  }

  /**
   * Internal helper to register a discovered TCP device and trigger callbacks.
   */
  private _addTcp(res: IScanResult[], sid: number, host: string, port: number, opts: IScanOptions) {
    const device: IScanResult = { type: 'node-tcp', slaveId: sid, host, tcpPort: port };
    res.push(device);
    opts.onDeviceFound?.(device);
  }
}
