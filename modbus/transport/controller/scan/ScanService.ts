// modbus/transport/controller/scan/ScanService.ts

import { Logger } from 'pino';
import { ModbusScanner, ScanController } from '../../../utils/scanner.js';
import type { IScanOptions, IScanResult } from '../../../types/public.js';

export class ScanService {
  private _activeController: ScanController | null = null;
  private readonly _scanner: ModbusScanner;

  constructor(logger: Logger) {
    this._scanner = new ModbusScanner(logger);
  }

  public pause(): void {
    this._activeController?.pause();
  }

  public resume(): void {
    this._activeController?.resume();
  }

  public stop(): void {
    this._activeController?.stop();
    this._activeController = null;
  }

  public async scanRtu(options: IScanOptions, controller?: ScanController): Promise<IScanResult[]> {
    this._activeController = controller ?? new ScanController();

    try {
      const transportType = this._detectRtuTransportType(options);
      return await this._scanner.scanRtu(options, transportType, this._activeController);
    } finally {
      this._activeController = null;
    }
  }

  public async scanTcp(options: IScanOptions, controller?: ScanController): Promise<IScanResult[]> {
    this._activeController = controller ?? new ScanController();

    try {
      return await this._scanner.scanTcp(options, this._activeController);
    } finally {
      this._activeController = null;
    }
  }

  private _detectRtuTransportType(options: IScanOptions): 'node-rtu' | 'web-rtu' {
    if (options.type) return options.type;
    if (options.path && typeof options.path !== 'string') return 'web-rtu';
    return 'node-rtu';
  }
}
