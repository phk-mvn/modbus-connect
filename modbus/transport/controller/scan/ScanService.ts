// modbus/transport/controller/scan/ScanService.ts

import { Logger } from 'pino';
import { ModbusScanner, ScanController } from '../../../utils/scanner.js';
import { TrafficSniffer } from '../../trackers/traffic-sniffer.js';
import type { IScanOptions, IScanReport, IWebSerialPort } from '../../../types/public.js';

/**
 * Service responsible for managing Modbus device scanning operations.
 * Supports both RTU (Serial) and TCP (Network) scanning.
 */
export class ScanService {
  private _activeController: ScanController | null = null;
  private _isScanning: boolean = false;
  private readonly _scanner: ModbusScanner;

  /**
   * @param {Logger} logger - Pino logger instance for scan activity.
   * @param {TrafficSniffer} [sniffer] - Optional sniffer for debugging raw traffic during scans.
   */
  constructor(logger: Logger, sniffer?: TrafficSniffer) {
    this._scanner = new ModbusScanner(logger, sniffer ?? undefined);
  }

  /** Indicates whether a scanning process is currently active. */
  public get isScanning(): boolean {
    return this._isScanning;
  }

  /** Pauses the current scanning operation. */
  public pause(): void {
    this._activeController?.pause();
  }

  /** Resumes a paused scanning operation. */
  public resume(): void {
    this._activeController?.resume();
  }

  /** Stops the current scanning operation immediately. */
  public stop(): void {
    this._activeController?.stop();
  }

  /**
   * Starts a Modbus RTU scan.
   * Automatically detects if the environment is Node.js or WebSerial based on options.
   *
   * @param {IScanOptions} options - Scanning parameters (baud rates, slave IDs, etc.).
   * @param {ScanController} [controller] - Optional external controller to manage the scan state.
   * @returns {Promise<IScanReport>} Results of the scan.
   * @throws {Error} If another scan is already in progress.
   */
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

  /**
   * Starts a Modbus TCP scan.
   *
   * @param {IScanOptions} options - Scanning parameters (hosts, ports, unit IDs).
   * @param {ScanController} [controller] - Optional external controller.
   * @returns {Promise<IScanReport>} Results of the scan.
   * @throws {Error} If another scan is already in progress.
   */
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

  /**
   * Internal helper to determine if the scan should use Node SerialPort or WebSerial API.
   * @private
   */
  private _detectRtuTransportType(options: IScanOptions): 'node-rtu' | 'web-rtu' {
    if (options.type) return options.type;

    const path = options.path;
    if (path && typeof path === 'object' && 'open' in path && 'readable' in path) {
      return 'web-rtu';
    }

    return 'node-rtu';
  }
}
