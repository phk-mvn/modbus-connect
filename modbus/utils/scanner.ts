// modbus/utils/scanner.ts

/**
 * Modbus network and serial bus discovery scanner.
 * Probes baud rates, parities, and unit IDs on RTU and TCP buses
 * to discover connected devices without prior knowledge of communication parameters.
 */

import { Logger, type ILogObj } from 'tslog';
import { TransportFactory } from '../transport/factory.js';
import { ModbusProtocol } from '../core/protocol.js';
import { RtuFramer, TcpFramer } from '../protocol/framing.js';
import {
  buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse,
} from '../protocol/functions.js';
import {
  IScanOptions,
  IScanResult,
  IScanController,
  IScanStats,
  IScanReport,
  TScanProfile,
  TParityType,
} from '../types/public.js';
import { ModbusExceptionError, ModbusCRCError } from '../core/errors.js';
import { TrafficSniffer } from '../transport/trackers/traffic-sniffer.js';

/**
 * Predefined scanning parameter presets.
 * - 'quick': Standard baud rates, common parities, short timeouts.
 * - 'deep': Broad sweep covering low baud rates down to 1200, all parity combinations, longer timeouts.
 * - 'custom': Empty preset requiring explicit option definitions.
 */
const SCAN_PROFILES: Record<TScanProfile, Partial<IScanOptions>> = {
  quick: {
    bauds: [115200, 57600, 38400, 19200, 9600],
    parities: ['none', 'even'],
    stopBitsList: [1, 2],
    slaveIds: Array.from({ length: 247 }, (_, i) => i + 1),
    unitIds: Array.from({ length: 247 }, (_, i) => i + 1),
    concurrency: 100,
    tcpTimeout: 200,
    padding: 5,
  },
  deep: {
    bauds: [115200, 57600, 38400, 19200, 9600, 4800, 2400, 1200],
    parities: ['none', 'even', 'odd', 'mark', 'space'],
    stopBitsList: [1, 2],
    slaveIds: Array.from({ length: 247 }, (_, i) => i + 1),
    unitIds: Array.from({ length: 247 }, (_, i) => i + 1),
    concurrency: 25,
    tcpTimeout: 500,
    padding: 10,
  },
  custom: {},
};

/**
 * Resolves user-supplied scan options with profile defaults and fallback values.
 *
 * @param options - Incomplete or user-customized scan options.
 * @returns Fully populated scan options object with guaranteed default values.
 */
function resolveOptions(
  options: IScanOptions
): Required<
  Pick<
    IScanOptions,
    | 'bauds'
    | 'parities'
    | 'stopBitsList'
    | 'slaveIds'
    | 'unitIds'
    | 'concurrency'
    | 'tcpTimeout'
    | 'padding'
  >
> &
  IScanOptions {
  const profileDefaults = SCAN_PROFILES[options.profile] ?? {};
  const merged = { ...profileDefaults, ...options };
  return {
    ...merged,
    bauds: merged.bauds ?? [115200, 57600, 38400, 19200, 9600],
    parities: merged.parities ?? ['none', 'even', 'odd'],
    stopBitsList: merged.stopBitsList ?? [1, 2],
    slaveIds: merged.slaveIds ?? Array.from({ length: 247 }, (_, i) => i + 1),
    unitIds: merged.unitIds ?? Array.from({ length: 247 }, (_, i) => i + 1),
    concurrency: merged.concurrency ?? 50,
    tcpTimeout: merged.tcpTimeout ?? 250,
    padding: merged.padding ?? 5,
  };
}

/**
 * Checks whether the scan process has been halted via the controller or an AbortSignal.
 *
 * @param ctrl - Scan controller instance.
 * @param signal - Optional AbortSignal.
 * @returns True if scan has been stopped or aborted, false otherwise.
 */
function isScanStopped(ctrl: IScanController, signal?: AbortSignal): boolean {
  return ctrl.isStopped || (signal?.aborted ?? false);
}

/**
 * Controller class to manage the execution state of an active scanning process.
 * Provides methods to pause, resume, or abort ongoing scans.
 */
export class ScanController implements IScanController {
  private _isPaused: boolean = false;
  private _isStopped: boolean = false;

  /**
   * Pauses the current scan. Probe requests will pause before the next attempt until resumed.
   *
   * @returns void
   */
  public pause(): void {
    this._isPaused = true;
  }

  /**
   * Resumes a previously paused scan operation.
   *
   * @returns void
   */
  public resume(): void {
    this._isPaused = false;
  }

  /**
   * Immediately terminates the scanning process.
   *
   * @returns void
   */
  public stop(): void {
    this._isStopped = true;
  }

  /**
   * Resets the controller flags back to default (not paused, not stopped).
   *
   * @returns void
   */
  public reset(): void {
    this._isPaused = false;
    this._isStopped = false;
  }

  /**
   * Indicates whether the scan is currently paused.
   *
   * @returns True if paused, false otherwise.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Indicates whether the scan has been aborted or stopped.
   *
   * @returns True if stopped, false otherwise.
   */
  get isStopped(): boolean {
    return this._isStopped;
  }
}

/**
 * Core utility class for discovering Modbus devices on Serial (RTU) and TCP networks.
 * Performs systematic probing using configurable profiles and reports verified devices.
 */
export class ModbusScanner {
  /**
   * Creates an instance of ModbusScanner.
   *
   * @param logger - tslog Logger instance for reporting scan activities.
   * @param _sniffer - Optional TrafficSniffer to monitor scan requests and responses.
   */
  constructor(
    private logger: Logger<ILogObj>,
    private _sniffer?: TrafficSniffer
  ) {}

  /**
   * Scans a physical serial or WebSerial port for Modbus RTU devices.
   * Iterates through combinations of Baud Rate, Parity, Stop Bits, and Slave IDs.
   *
   * @param options - Scanning parameters, callbacks, and profile configuration.
   * @param transportType - Environment-specific transport driver ('node-rtu' or 'web-rtu').
   * @param ctrl - Controller to manage execution state (pause/resume/stop).
   * @returns A Promise resolving to an IScanReport containing discovered devices and statistics.
   */
  public async scanRtu(
    options: IScanOptions,
    transportType: 'node-rtu' | 'web-rtu',
    ctrl: IScanController
  ): Promise<IScanReport> {
    const opts = resolveOptions(options);
    const results: IScanResult[] = [];
    const foundKeys = new Set<string>();
    const pdu = buildReadHoldingRegistersRequest(opts.registerAddress ?? 0, 1);

    const stats: IScanStats = {
      durationMs: 0,
      probesSent: 0,
      timeouts: 0,
      crcErrors: 0,
      exceptionResponses: 0,
    };

    const startTime = Date.now();

    for (const baud of opts.bauds!) {
      if (isScanStopped(ctrl, opts.signal)) break;
      for (const parity of opts.parities!) {
        if (isScanStopped(ctrl, opts.signal)) break;
        for (const stopBits of opts.stopBitsList!) {
          if (isScanStopped(ctrl, opts.signal)) break;

          const timeout = Math.ceil(264000 / baud + opts.padding!);

          let transport: any;
          try {
            const transportOpts: any = {
              port: opts.path,
              baudRate: baud,
              parity: parity,
              stopBits: stopBits,
              dataBits: 8,
              RSMode: 'RS485',
            };
            transport = await TransportFactory.create(
              transportType,
              transportOpts,
              this.logger,
              this._sniffer ?? null
            );

            await transport.connect();
          } catch (err: any) {
            this.logger.warn(
              `Failed to open port (baud ${baud}, parity ${parity}, stopBits ${stopBits}), skipping: ${err?.message}`
            );
            continue;
          }

          try {
            const protocol = new ModbusProtocol(transport, RtuFramer);

            for (let i = 0; i < opts.slaveIds!.length; i++) {
              if (isScanStopped(ctrl, opts.signal)) break;

              while (ctrl.isPaused) {
                await new Promise(r => setTimeout(r, 50));
                if (isScanStopped(ctrl, opts.signal)) break;
              }
              if (isScanStopped(ctrl, opts.signal)) break;

              const slaveId = opts.slaveIds![i];
              opts.onProgress?.(i + 1, opts.slaveIds!.length, { baud, parity, stopBits, slaveId });

              try {
                stats.probesSent++;
                const responsePdu = await protocol.exchange(slaveId, pdu, timeout);
                const registers = parseReadHoldingRegistersResponse(responsePdu);
                opts.onRegisterRead?.(slaveId, opts.registerAddress ?? 0, registers[0]);

                this._addRtu(
                  results,
                  foundKeys,
                  transportType,
                  slaveId,
                  baud,
                  parity,
                  stopBits,
                  opts
                );
              } catch (err: any) {
                stats.probesSent++;
                if (err instanceof ModbusExceptionError) {
                  stats.exceptionResponses++;
                  this._addRtu(
                    results,
                    foundKeys,
                    transportType,
                    slaveId,
                    baud,
                    parity,
                    stopBits,
                    opts
                  );
                } else if (err instanceof ModbusCRCError) {
                  stats.crcErrors++;
                } else {
                  stats.timeouts++;
                }
              }
            }
          } finally {
            if (transport) await transport.disconnect();
          }
        }
      }
    }

    stats.durationMs = Date.now() - startTime;
    opts.onStats?.(stats);
    opts.onFinish?.(results);

    return { results, stats };
  }

  /**
   * Scans Modbus TCP unit IDs over an Ethernet/IP network connection.
   * Utilizes configurable concurrency to probe multiple Unit IDs simultaneously.
   *
   * @param options - Scanning parameters and callbacks.
   * @param ctrl - Controller to manage execution state (pause/resume/stop).
   * @returns A Promise resolving to an IScanReport containing discovered devices and statistics.
   */
  public async scanTcp(options: IScanOptions, ctrl: IScanController): Promise<IScanReport> {
    const opts = resolveOptions(options);
    const results: IScanResult[] = [];
    const hosts = opts.hosts || ['127.0.0.1'];
    const ports = opts.ports || [502];
    const unitIds = opts.unitIds!;
    const concurrency = opts.concurrency!;
    const tcpTimeout = opts.tcpTimeout!;
    const pdu = buildReadHoldingRegistersRequest(opts.registerAddress ?? 0, 1);

    const stats: IScanStats = {
      durationMs: 0,
      probesSent: 0,
      timeouts: 0,
      crcErrors: 0,
      exceptionResponses: 0,
    };

    const startTime = Date.now();
    let probeIndex = 0;

    for (const host of hosts) {
      if (isScanStopped(ctrl, opts.signal)) break;
      for (const port of ports) {
        if (isScanStopped(ctrl, opts.signal)) break;

        let transport: any;
        try {
          transport = await TransportFactory.create(
            'node-tcp',
            { host, port },
            this.logger,
            this._sniffer ?? null
          );
          await transport.connect();
        } catch (err: any) {
          this.logger.warn(`Failed to connect to ${host}:${port}, skipping: ${err?.message}`);
          continue;
        }

        try {
          const protocol = new ModbusProtocol(transport, TcpFramer);

          for (let i = 0; i < unitIds.length; i += concurrency) {
            if (isScanStopped(ctrl, opts.signal)) break;
            while (ctrl.isPaused) {
              await new Promise(r => setTimeout(r, 50));
              if (isScanStopped(ctrl, opts.signal)) break;
            }
            if (isScanStopped(ctrl, opts.signal)) break;

            const chunk = unitIds.slice(i, i + concurrency);
            await Promise.all(
              chunk.map(async unitId => {
                try {
                  stats.probesSent++;

                  const responsePdu = await protocol.exchange(unitId, pdu, tcpTimeout);
                  const registers = parseReadHoldingRegistersResponse(responsePdu);
                  opts.onRegisterRead?.(unitId, opts.registerAddress ?? 0, registers[0]);

                  this._addTcp(results, unitId, host, port, opts);
                } catch (err: any) {
                  stats.probesSent++;
                  if (err instanceof ModbusExceptionError) {
                    stats.exceptionResponses++;
                    this._addTcp(results, unitId, host, port, opts);
                  } else if (err instanceof ModbusCRCError) {
                    stats.crcErrors++;
                  } else {
                    stats.timeouts++;
                  }
                }

                probeIndex++;
                opts.onProgress?.(probeIndex, unitIds.length, { host, port, unitId });
              })
            );
          }
        } finally {
          if (transport) await transport.disconnect();
        }
      }
    }

    stats.durationMs = Date.now() - startTime;
    opts.onStats?.(stats);
    opts.onFinish?.(results);

    return { results, stats };
  }

  /**
   * Internal helper to record an identified RTU device into the results collection.
   *
   * @param res - Target results array.
   * @param set - Set tracking deduplication keys.
   * @param type - Transport type ('node-rtu' or 'web-rtu').
   * @param sid - Slave unit ID.
   * @param baud - Baud rate.
   * @param parity - Parity mode.
   * @param stopBits - Stop bits count.
   * @param opts - Resolved scan options.
   * @returns void
   * @private
   */
  private _addRtu(
    res: IScanResult[],
    set: Set<string>,
    type: 'node-rtu' | 'web-rtu',
    sid: number,
    baud: number,
    parity: TParityType,
    stopBits: 1 | 2,
    opts: ReturnType<typeof resolveOptions>
  ): void {
    const key = opts.multiBaud
      ? `${sid}:${baud}:${parity}:${stopBits}`
      : `${sid}:${parity}:${stopBits}`;
    if (set.has(key)) return;
    set.add(key);

    const device: IScanResult = {
      type,
      slaveId: sid,
      baudRate: baud,
      parity,
      port: typeof opts.path === 'string' ? opts.path : undefined,
      stopBits,
      discoveredAt: Date.now(),
    };
    res.push(device);
    opts.onDeviceFound?.(device);
  }

  /**
   * Internal helper to record an identified TCP device into the results collection.
   *
   * @param res - Target results array.
   * @param sid - Slave unit ID.
   * @param host - Remote host IP address.
   * @param port - Remote TCP port number.
   * @param opts - Resolved scan options.
   * @returns void
   * @private
   */
  private _addTcp(
    res: IScanResult[],
    sid: number,
    host: string,
    port: number,
    opts: ReturnType<typeof resolveOptions>
  ): void {
    const device: IScanResult = {
      type: 'node-tcp',
      slaveId: sid,
      host,
      tcpPort: port,
      discoveredAt: Date.now(),
    };
    res.push(device);
    opts.onDeviceFound?.(device);
  }
}
