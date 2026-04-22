// modbus/utils/scanner.ts

import { Logger } from 'pino';
import { TransportFactory } from '../transport/factory.js';
import { ModbusProtocol } from '../core/protocol.js';
import { RtuFramer, TcpFramer } from '../protocol/framing.js';
import { buildReadHoldingRegistersRequest } from '../protocol/functions.js';
import {
  IScanOptions,
  IScanResult,
  IScanController,
  IScanStats,
  IScanReport,
  IScanProgressRtu,
  IScanProgressTcp,
  TScanProfile,
  TParityType,
} from '../types/public.js';
import { ModbusExceptionError, ModbusCRCError } from '../core/errors.js';
import { TrafficSniffer } from '../transport/trackers/traffic-sniffer.js';

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

function isScanStopped(ctrl: IScanController, signal?: AbortSignal): boolean {
  return ctrl.isStopped || (signal?.aborted ?? false);
}

export class ScanController implements IScanController {
  private _isPaused: boolean = false;
  private _isStopped: boolean = false;

  public pause(): void {
    this._isPaused = true;
  }

  public resume(): void {
    this._isPaused = false;
  }

  public stop(): void {
    this._isStopped = true;
  }

  public reset(): void {
    this._isPaused = false;
    this._isStopped = false;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get isStopped(): boolean {
    return this._isStopped;
  }
}

export class ModbusScanner {
  constructor(
    private logger: Logger,
    private _sniffer?: TrafficSniffer
  ) {}

  public async scanRtu(
    options: IScanOptions,
    transportType: 'node-rtu' | 'web-rtu',
    ctrl: IScanController
  ): Promise<IScanReport> {
    const opts = resolveOptions(options);
    const results: IScanResult[] = [];
    const foundIds = new Set<number>();
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

          let transport: any = null;
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
              { baud, parity, stopBits, err: err?.message },
              'Failed to open port, skipping'
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
                await protocol.exchange(slaveId, pdu, timeout);
                this._addRtu(
                  results,
                  foundIds,
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
                    foundIds,
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

        let transport: any = null;
        try {
          transport = await TransportFactory.create(
            'node-tcp',
            { host, port },
            this.logger,
            this._sniffer ?? null
          );
          await transport.connect();
        } catch (err: any) {
          this.logger.warn({ host, port, err: err?.message }, 'Failed to connect, skipping');
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
                  await protocol.exchange(unitId, pdu, tcpTimeout);
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

  private _addRtu(
    res: IScanResult[],
    set: Set<number>,
    type: 'node-rtu' | 'web-rtu',
    sid: number,
    baud: number,
    parity: TParityType,
    stopBits: 1 | 2,
    opts: ReturnType<typeof resolveOptions>
  ) {
    if (!opts.multiBaud && set.has(sid)) return;
    set.add(sid);

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

  private _addTcp(
    res: IScanResult[],
    sid: number,
    host: string,
    port: number,
    opts: ReturnType<typeof resolveOptions>
  ) {
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
