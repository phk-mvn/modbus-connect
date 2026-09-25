// modbus/transport/controller/scan/ScanService.ts

import { Logger, type ILogObj } from 'tslog';
import { ModbusScanner, ScanController } from '../../../utils/scanner.js';
import { TrafficSniffer } from '../../trackers/traffic-sniffer.js';
import type { IScanOptions, IScanReport } from '../../../types/public.js';

/** Session hand-over hooks the controller uses to pause the scanned port. */
export interface IScanSessionHooks {
  /** Called right before the scan starts (pauses the matching port session). */
  pauseSession?: (options: IScanOptions) => Promise<void>;
  /** Called in the finally block of a scan (releases the matching port session). */
  resumeSession?: (options: IScanOptions) => Promise<void>;
}

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
  constructor(logger: Logger<ILogObj>, sniffer?: TrafficSniffer) {
    this._scanner = new ModbusScanner(logger, sniffer ?? undefined);
  }

  /**
   * Indicates whether a scan operation is currently in progress.
   * @returns {boolean} True if a scan is active, false otherwise.
   */
  public get isScanning(): boolean {
    return this._isScanning;
  }

  /**
   * Pauses the current scanning operation, if any.
   * If no scan is active, this method has no effect.
   * Use the ScanController to manage scan state externally.
   * @throws {Error} If no scan is currently active.
   */
  public pause(): void {
    this._activeController?.pause();
  }

  /** Resumes the current scanning operation, if it was previously paused.
   * If no scan is active or if the scan is not paused, this method has no effect.
   * Use the ScanController to manage scan state externally.
   * @throws {Error} If no scan is currently active.
   */
  public resume(): void {
    this._activeController?.resume();
  }

  /** Stops the current scanning operation, if any.
   * If no scan is active, this method has no effect.
   * Use the ScanController to manage scan state externally.
   * @throws {Error} If no scan is currently active.
   */
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
  public async scanRtu(
    options: IScanOptions,
    controller?: ScanController,
    hooks?: IScanSessionHooks
  ): Promise<IScanReport> {
    if (this._isScanning) {
      throw new Error(
        'A scan is already in progress. Stop the current scan before starting a new one.'
      );
    }

    this._isScanning = true;
    this._activeController = controller ?? new ScanController();

    let paused = false;
    try {
      await hooks?.pauseSession?.(options);
      paused = true;

      const transportType = this._detectRtuTransportType(options);
      return await this._scanner.scanRtu(options, transportType, this._activeController);
    } finally {
      if (paused) await hooks?.resumeSession?.(options);
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
  public async scanTcp(
    options: IScanOptions,
    controller?: ScanController,
    hooks?: IScanSessionHooks
  ): Promise<IScanReport> {
    if (this._isScanning) {
      throw new Error(
        'A scan is already in progress. Stop the current scan before starting a new one.'
      );
    }

    this._isScanning = true;
    this._activeController = controller ?? new ScanController();

    let paused = false;
    try {
      await hooks?.pauseSession?.(options);
      paused = true;

      return await this._scanner.scanTcp(options, this._activeController);
    } finally {
      if (paused) await hooks?.resumeSession?.(options);
      this._activeController = null;
      this._isScanning = false;
    }
  }

  /** Detects the appropriate RTU transport type based on the provided scan options.
   * If the 'type' property is explicitly set in options, it is used directly.
   * Otherwise, the method infers the transport type based on the 'path' property.
   *
   * @param {IScanOptions} options - The scan options containing potential transport information.
   * @returns {'node-rtu' | 'web-rtu'} The determined transport type for RTU scanning.
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
