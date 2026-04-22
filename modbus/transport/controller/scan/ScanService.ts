// modbus/transport/controller/scan/ScanService.ts

import { Logger } from 'pino';
import { ModbusScanner, ScanController } from '../../../utils/scanner.js';
import { TrafficSniffer } from '../../trackers/traffic-sniffer.js';
import type { IScanOptions, IScanReport, IWebSerialPort } from '../../../types/public.js';

export class ScanService {
  private _activeController: ScanController | null = null;
  private _isScanning: boolean = false;
  private readonly _scanner: ModbusScanner;

  constructor(logger: Logger, sniffer?: TrafficSniffer) {
    this._scanner = new ModbusScanner(logger, sniffer ?? undefined);
  }

  public get isScanning(): boolean {
    return this._isScanning;
  }

  public pause(): void {
    this._activeController?.pause();
  }

  public resume(): void {
    this._activeController?.resume();
  }

  public stop(): void {
    this._activeController?.stop();
  }

  public async scanRtu(options: IScanOptions, controller?: ScanController): Promise<IScanReport> {
    if (this._isScanning) {
      throw new Error(
        'A scan is already in progress. Stop the current scan before starting a new one.'
      );
    }

    this._isScanning = true;
    this._activeController = controller ?? new ScanController();

    try {
      const transportType = this._detectRtuTransportType(options);
      return await this._scanner.scanRtu(options, transportType, this._activeController);
    } finally {
      this._activeController = null;
      this._isScanning = false;
    }
  }

  public async scanTcp(options: IScanOptions, controller?: ScanController): Promise<IScanReport> {
    if (this._isScanning) {
      throw new Error(
        'A scan is already in progress. Stop the current scan before starting a new one.'
      );
    }

    this._isScanning = true;
    this._activeController = controller ?? new ScanController();

    try {
      return await this._scanner.scanTcp(options, this._activeController);
    } finally {
      this._activeController = null;
      this._isScanning = false;
    }
  }

  private _detectRtuTransportType(options: IScanOptions): 'node-rtu' | 'web-rtu' {
    if (options.type) return options.type;

    const path = options.path;
    if (path && typeof path === 'object' && 'open' in path && 'readable' in path) {
      return 'web-rtu';
    }

    return 'node-rtu';
  }
}
