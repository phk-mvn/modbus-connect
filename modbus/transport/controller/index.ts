// modbus/transport/controller/index.ts

import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import { TransportFactory } from '../factory.js';
import { TransportRegistry } from './registry/TransportRegistry.js';
import { TransportRouter } from './router/TransportRouter.js';
import { StateManager } from './state/StateManager.js';
import { PollingProxy } from './polling/PollingProxy.js';
import { ScanService } from './scan/ScanService.js';
import { TrafficSniffer } from '../trackers/traffic-sniffer.js';
import * as utils from '../../utils/buffer.js';
import PollingManager from '../../polling/manager.js';
import { ScanController } from '../../utils/scanner.js';
import { RSModeConstraintError } from '../../core/errors.js';

import type {
  ITransportController,
  ITransportInfo,
  ITransportStatus,
  ITransport,
  TTransportType,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
  IScanOptions,
  IScanReport,
  IPollingTaskOptions,
  IPollingQueueInfo,
  IPollingManagerConfig,
  INodeSerialTransportOptions,
  IWebSerialTransportOptions,
  IWebSerialPort,
  ITransportControllerOptions,
  EConnectionErrorType,
} from '../../types/public.js';
import type { TPollingAction, TPollingBulkAction } from '../../types/public.js';

/**
 * The main controller for managing Modbus transports.
 * It serves as an orchestrator for transport creation, device state tracking,
 * routing requests to the correct bus, and managing polling tasks.
 *
 * This class implements a thread-safe approach using Mutex for CRUD operations.
 */
class TransportController implements ITransportController {
  private readonly _mutex = new Mutex();
  public logger: Logger;

  private readonly _registry: TransportRegistry;
  private readonly _router: TransportRouter;
  private readonly _stateManager: StateManager;
  private readonly _pollingProxy: PollingProxy;
  private readonly _scanService: ScanService;

  private _sniffer: TrafficSniffer | null = null;

  /**
   * Returns the traffic sniffer if enabled, allowing inspection of raw binary traffic.
   */
  public get sniffer(): TrafficSniffer | null {
    return this._sniffer;
  }

  /**
   * Initializes a new TransportController.
   *
   * @param {ITransportControllerOptions} options - Configuration for the controller (e.g., enable sniffer).
   */
  constructor(options: ITransportControllerOptions = {}) {
    this.logger = this._createLogger();

    if (options.sniffer) {
      this._sniffer = new TrafficSniffer();
    }

    this._registry = new TransportRegistry();
    this._router = new TransportRouter(this._registry);
    this._stateManager = new StateManager();
    this._pollingProxy = new PollingProxy(this._registry);
    this._scanService = new ScanService(this.logger, this._sniffer ?? undefined);

    this.logger.debug('TransportController initialized');
  }

  // ==================== Logger ====================

  /**
   * Silences the internal logger.
   */
  public disableLogger(): void {
    this.logger.level = 'silent';
  }

  /**
   * Enables the internal logger with 'info' level.
   */
  public enableLogger(): void {
    this.logger.level = 'info';
  }

  /**
   * Creates a pino logger instance with pretty printing for non-production environments.
   * @private
   */
  private _createLogger(): Logger {
    return pino({
      level: 'info',
      base: { component: 'Transport Controller' },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });
  }

  // ==================== Scan ====================

  /** Pauses the currently active scan operation. */
  public pauseScan(): void {
    this._scanService.pause();
  }

  /** Resumes a previously paused scan operation. */
  public resumeScan(): void {
    this._scanService.resume();
  }

  /** Aborts the currently active scan operation. */
  public stopScan(): void {
    this._scanService.stop();
  }

  /**
   * Performs a scan on a Serial/RTU port to discover Modbus devices.
   *
   * @param {IScanOptions} options - Scan parameters (baud rates, slave IDs, etc.).
   * @returns {Promise<IScanReport>} Result of the discovery process.
   */
  public async scanRtuPort(options: IScanOptions): Promise<IScanReport> {
    this.logger.info('Starting RTU scan');
    return this._scanService.scanRtu(options, options.controller as ScanController | undefined);
  }

  /**
   * Performs a scan on a Network/TCP port to discover Modbus units.
   *
   * @param {IScanOptions} options - Scan parameters (hosts, ports, unit IDs).
   * @returns {Promise<IScanReport>} Result of the discovery process.
   */
  public async scanTcpPort(options: IScanOptions): Promise<IScanReport> {
    this.logger.info('Starting TCP scan');
    return this._scanService.scanTcp(options, options.controller as ScanController | undefined);
  }

  // ==================== Transport CRUD ====================

  /**
   * Adds and initializes a new transport.
   * Validates RSMode constraints (e.g., RS232 only allows one device).
   *
   * @param {string} id - Unique identifier for the transport.
   * @param {TTransportType} type - Transport type (node-rtu, node-tcp, etc.).
   * @param {object} options - Connection parameters.
   * @param {object} [reconnectOptions] - Settings for automatic reconnection.
   * @param {IPollingManagerConfig} [pollingConfig] - Custom settings for the internal polling manager.
   * @throws {Error} If transport ID exists or RSMode constraints are violated.
   */
  public async addTransport(
    id: string,
    type: TTransportType,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: IPollingManagerConfig
  ): Promise<void> {
    await this._mutex.runExclusive(async () => {
      if (this._registry.has(id)) {
        throw new Error(`Transport with id "${id}" already exists`);
      }

      const rsMode = (options as any).RSMode;
      const slaveIds = (options as any).slaveIds || [];

      if (rsMode === 'RS232' && slaveIds.length > 1) {
        throw new RSModeConstraintError(
          `Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device.`
        );
      }

      const seenSlaveIds = new Set<number>();
      for (const slaveId of slaveIds) {
        if (seenSlaveIds.has(slaveId)) {
          throw new Error(`Duplicate slave ID ${slaveId} for transport "${id}".`);
        }
        seenSlaveIds.add(slaveId);
      }

      const transport = await TransportFactory.create(type, options, this.logger, this._sniffer);
      const pollingManager = new PollingManager(pollingConfig);

      const info: ITransportInfo = {
        id,
        type,
        transport,
        pollingManager,
        status: 'disconnected',
        slaveIds: [...slaveIds],
        rsMode: transport.getRSMode(),
        fallbacks: (options as any).fallbacks || [],
        createdAt: new Date(),
        reconnectAttempts: 0,
        maxReconnectAttempts: reconnectOptions?.maxReconnectAttempts ?? 5,
        reconnectInterval: reconnectOptions?.reconnectInterval ?? 2000,
      };

      await this._registry.add(info);
      this._stateManager.createTrackersForTransport(id);

      transport.setDeviceStateHandler((slaveId: number, connected: boolean, error: any) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      transport.setPortStateHandler((connected: boolean, slaveIds: number[], error: any) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      this.logger.info(`Transport "${id}" added with PollingManager`);
    });
  }

  /**
   * Removes a transport, stops its polling, and cleans up its resources.
   *
   * @param {string} id - The ID of the transport to remove.
   */
  public async removeTransport(id: string): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const info = this._registry.get(id);
      if (!info) return;

      info.transport.setDeviceStateHandler(() => {});
      info.transport.setPortStateHandler(() => {});

      info.pollingManager.clearAll();
      await this._disconnectTransportInternal(id);
      this._registry.clearSlaveAssignments(id);

      const transportAny = info.transport as any;
      if (typeof transportAny.removeConnectedDevice === 'function') {
        for (const sid of info.slaveIds) {
          transportAny.removeConnectedDevice(sid);
        }
      }

      await this._stateManager.clearTransport(id);
      await this._registry.remove(id);

      this.logger.info(`Transport "${id}" removed`);
    });
  }

  /**
   * Retrieves the raw ITransport instance for a given ID.
   */
  public getTransport(id: string): ITransport | null {
    return this._registry.get(id)?.transport ?? null;
  }

  /**
   * Returns a list of all registered transport information.
   */
  public listTransports(): ITransportInfo[] {
    return this._registry.getAll();
  }

  // ==================== Connection Management ====================

  /** Attempts to connect all registered transports. */
  public async connectAll(): Promise<void> {
    await Promise.all(this._registry.getAll().map(info => this.connectTransport(info.id)));
  }

  /** Disconnects all registered transports. */
  public async disconnectAll(): Promise<void> {
    await Promise.all(this._registry.getAll().map(info => this.disconnectTransport(info.id)));
  }

  /**
   * Connects a specific transport.
   * @param {string} id - Transport identifier.
   */
  public async connectTransport(id: string): Promise<void> {
    const info = this._registry.get(id);
    if (!info || info.status === 'connected' || info.status === 'connecting') return;

    info.status = 'connecting';
    try {
      await info.transport.connect();
      info.status = 'connected';
      info.reconnectAttempts = 0;
      this._pollingProxy.resumeAllForTransport(id);
      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = 'error';
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ transportId: id, err: info.lastError.message }, 'Failed to connect');
      throw err;
    }
  }

  /**
   * Disconnects a specific transport and stops its polling tasks.
   */
  public async disconnectTransport(id: string): Promise<void> {
    const info = this._registry.get(id);
    if (!info) return;

    this._pollingProxy.stopAllForTransport(id);
    await info.transport.disconnect();
    info.status = 'disconnected';
    this.logger.info(`Transport "${id}" disconnected`);
  }

  // ==================== Routing ====================

  /**
   * Finds an appropriate transport instance for a specific Slave ID and RS mode.
   * @param {number} slaveId - The Modbus slave ID.
   * @param {TRSMode} requiredRSMode - The required communication mode.
   */
  public getTransportForSlave(slaveId: number, requiredRSMode: TRSMode): ITransport | null {
    return this._router.select(slaveId, requiredRSMode);
  }

  /**
   * Assigns a Slave ID to a transport.
   * Checks for RS232 limitations (max 1 device).
   */
  public async assignSlaveIdToTransport(transportId: string, slaveId: number): Promise<void> {
    await this._mutex.runExclusive(() => {
      const info = this._registry.get(transportId);
      if (!info) throw new Error(`Transport "${transportId}" not found`);

      if (info.rsMode === 'RS232' && info.slaveIds.length >= 1) {
        throw new RSModeConstraintError(
          `Transport "${transportId}" is RS232 and already has device ${info.slaveIds[0]}`
        );
      }

      this._registry.assignSlave(transportId, slaveId);
      this.logger.info(`Assigned slave ${slaveId} to transport "${transportId}"`);
    });
  }

  /**
   * Unassigns a Slave ID from a transport.
   * If the transport becomes empty, it is automatically removed.
   */
  public async removeSlaveIdFromTransport(transportId: string, slaveId: number): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const info = this._registry.get(transportId);
      if (!info) return;

      this._registry.unassignSlave(transportId, slaveId);
      this._stateManager.removeDeviceState(slaveId, transportId);

      const transportAny = info.transport as any;
      if (typeof transportAny.removeConnectedDevice === 'function') {
        transportAny.removeConnectedDevice(slaveId);
      }

      this.logger.info(`Removed slave ${slaveId} from transport "${transportId}"`);

      if (info.slaveIds.length === 0) {
        this.logger.info(`Transport "${transportId}" is empty. Auto-removing...`);
        await this._removeTransportInternal(transportId);
      }
    });
  }

  // ==================== Hot Reload ====================

  /**
   * Re-initializes a transport with new options without removing its ID from the registry.
   * Useful for changing baud rate or IP address on the fly.
   */
  public async reloadTransport(
    id: string,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort })
  ): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const info = this._registry.get(id);
      if (!info) throw new Error(`Transport with id "${id}" not found`);

      const wasConnected = info.status === 'connected';

      info.pollingManager.clearAll();

      info.transport.setDeviceStateHandler(() => {});
      info.transport.setPortStateHandler(() => {});

      await this._disconnectTransportInternal(id);

      const newTransport = await TransportFactory.create(info.type, options, this.logger);
      info.transport = newTransport;
      info.rsMode = newTransport.getRSMode();

      this._stateManager.createTrackersForTransport(id);

      newTransport.setDeviceStateHandler((slaveId: number, connected: boolean, error: any) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      newTransport.setPortStateHandler((connected: boolean, slaveIds: number[], error: any) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      if (wasConnected) {
        info.status = 'connecting';
        try {
          await info.transport.connect();
          info.status = 'connected';
          info.reconnectAttempts = 0;
          info.pollingManager.resumeAllTasks();
        } catch (err) {
          info.status = 'error';
          info.lastError = err instanceof Error ? err : new Error(String(err));
          this.logger.error({ transportId: id }, 'Failed to reconnect after reload');
        }
      }

      this.logger.info(`Transport "${id}" reloaded`);
    });
  }

  // ==================== Write to Port ====================

  /**
   * Low-level method to write raw data to a transport and optionally read a response.
   * This call is wrapped in the transport's polling manager to ensure synchronized access to the port.
   *
   * @param {string} transportId - Target transport.
   * @param {Uint8Array} data - Raw binary data to write.
   * @param {number} [readLength=0] - Number of bytes to read after writing.
   * @param {number} [timeout=3000] - Read timeout.
   * @returns {Promise<Uint8Array>} The read response or an empty array.
   */
  public async writeToPort(
    transportId: string,
    data: Uint8Array,
    readLength: number = 0,
    timeout: number = 3000
  ): Promise<Uint8Array> {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);

    if (!info.transport.isOpen) {
      throw new Error(`Transport "${transportId}" is not open.`);
    }

    return info.pollingManager.executeImmediate(async () => {
      await info.transport.write(data);

      if (readLength > 0) {
        return info.transport.read(readLength, timeout);
      }

      await info.transport.flush();
      return utils.allocUint8Array(0);
    });
  }

  // ==================== State Handlers ====================

  /** Sets a global handler for device state changes. */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._stateManager.setDeviceHandler(handler);
  }

  /** Sets a global handler for port state changes. */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._stateManager.setPortHandler(handler);
  }

  /** Sets a device state handler for a specific transport only. */
  public async setDeviceStateHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void> {
    await this._stateManager.setDeviceHandlerForTransport(transportId, handler);
  }

  /** Sets a port state handler for a specific transport only. */
  public async setPortStateHandlerForTransport(
    transportId: string,
    handler: TPortStateHandler
  ): Promise<void> {
    await this._stateManager.setPortHandlerForTransport(transportId, handler);
  }

  // ==================== Polling Proxy ====================

  /** Adds a recurring polling task to a transport. */
  public addPollingTask(transportId: string, options: IPollingTaskOptions): void {
    this._pollingProxy.addTask(transportId, options);
  }

  /** Removes a specific polling task. */
  public removePollingTask(transportId: string, taskId: string): void {
    this._pollingProxy.removeTask(transportId, taskId);
  }

  /** Updates options for an existing polling task. */
  public async updatePollingTask(
    transportId: string,
    taskId: string,
    options: Partial<IPollingTaskOptions>
  ): Promise<void> {
    await this._pollingProxy.updateTask(transportId, taskId, options as IPollingTaskOptions);
  }

  /** Performs an action (start/stop/pause/resume) on a polling task. Accepts string or EPollingAction. */
  public controlTask(transportId: string, taskId: string, action: TPollingAction): void {
    this._pollingProxy.controlTask(transportId, taskId, action);
  }

  /** Performs a bulk action on all polling tasks of a transport. Accepts string or EPollingBulkAction. */
  public controlPolling(transportId: string, action: TPollingBulkAction): void {
    this._pollingProxy.controlAll(transportId, action);
  }

  /** Returns queue info and current task states for a transport. */
  public getPollingQueueInfo(transportId: string): IPollingQueueInfo {
    return this._pollingProxy.getQueueInfo(transportId);
  }

  /** Executes a one-off function with immediate priority on the transport's queue. */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    return this._pollingProxy.executeImmediate(transportId, fn);
  }

  // ==================== Status ====================

  /**
   * Retrieves status for one or all transports.
   * @param {string} [id] - Optional ID to get status for a single transport.
   */
  public getStatus(id?: string): ITransportStatus | Record<string, ITransportStatus> {
    if (id) {
      const info = this._registry.get(id);
      return info ? this._buildStatus(info) : ({} as ITransportStatus);
    }

    const result: Record<string, ITransportStatus> = {};
    for (const info of this._registry.getAll()) {
      result[info.id] = this._buildStatus(info);
    }
    return result;
  }

  /** Returns the count of transports currently in 'connected' state. */
  public getActiveTransportCount(): number {
    return this._registry.getAll().filter(i => i.status === 'connected').length;
  }

  /**
   * Maps internal transport info to a public status object.
   * @private
   */
  private _buildStatus(info: ITransportInfo): ITransportStatus {
    return {
      id: info.id,
      connected: info.status === 'connected',
      lastError: info.lastError,
      connectedSlaveIds: [...info.slaveIds],
      uptime: Date.now() - info.createdAt.getTime(),
      reconnectAttempts: info.reconnectAttempts,
    };
  }

  // ==================== Lifecycle ====================

  /**
   * Shuts down the controller, disconnecting all transports and clearing all polling tasks.
   */
  public async destroy(): Promise<void> {
    await this._mutex.runExclusive(async () => {
      for (const info of this._registry.getAll()) {
        this._pollingProxy.clearAllForTransport(info.id);
      }

      await Promise.all(
        this._registry.getAll().map(info => this._disconnectTransportInternal(info.id))
      );

      for (const info of this._registry.getAll()) {
        await this._stateManager.clearTransport(info.id);
      }

      this._registry.clearAll();

      this.logger.info('TransportController destroyed');
    });
  }

  // ==================== Internal Methods ====================

  /** Internal disconnect logic used by reload and destroy. @private */
  private async _disconnectTransportInternal(id: string): Promise<void> {
    const info = this._registry.get(id);
    if (!info) return;

    try {
      this._pollingProxy.pauseAllForTransport(id);
      await info.transport.disconnect();
      info.status = 'disconnected';
    } catch (err) {
      this.logger.error({ transportId: id }, 'Error disconnecting transport');
    }
  }

  /** Internal removal logic used by removeSlaveIdFromTransport. @private */
  private async _removeTransportInternal(id: string): Promise<void> {
    const info = this._registry.get(id);
    if (!info) return;

    info.transport.setDeviceStateHandler(() => {});
    info.transport.setPortStateHandler(() => {});

    info.pollingManager.clearAll();

    await this._disconnectTransportInternal(id);

    this._registry.clearSlaveAssignments(id);

    const transportAny = info.transport as any;
    if (typeof transportAny.removeConnectedDevice === 'function') {
      for (const sid of info.slaveIds) {
        transportAny.removeConnectedDevice(sid);
      }
    }

    await this._stateManager.clearTransport(id);
    await this._registry.remove(id);

    this.logger.info(`Transport "${id}" fully removed`);
  }

  /** Internal handler for device state changes received from ITransport. @private */
  private async _onDeviceStateChange(
    transportId: string,
    slaveId: number,
    connected: boolean,
    error?: { type: EConnectionErrorType; message: string }
  ): Promise<void> {
    const info = this._registry.get(transportId);
    if (!info) return;

    if (connected) {
      await this._stateManager.notifyDeviceConnected(transportId, slaveId);
    } else {
      const errorType = error?.type ?? ({} as EConnectionErrorType);
      const errorMessage = error?.message ?? 'Device disconnected';
      await this._stateManager.notifyDeviceDisconnected(
        transportId,
        slaveId,
        errorType as EConnectionErrorType,
        errorMessage
      );
    }
  }

  /** Internal handler for port/transport status changes received from ITransport. @private */
  private async _onPortStateChange(
    transportId: string,
    connected: boolean,
    slaveIds: number[],
    error?: { type: EConnectionErrorType; message: string }
  ): Promise<void> {
    const info = this._registry.get(transportId);
    if (!info) return;

    if (connected) {
      await this._stateManager.notifyPortConnected(transportId, info.slaveIds);
      this._pollingProxy.resumeAllForTransport(transportId);
      info.status = 'connected';
    } else {
      const errorType = error?.type ?? ({} as EConnectionErrorType);
      const errorMessage = error?.message ?? 'Port disconnected';
      this._pollingProxy.pauseAllForTransport(transportId);
      info.status = 'disconnected';
      await this._stateManager.notifyPortDisconnected(
        transportId,
        info.slaveIds,
        errorType as EConnectionErrorType,
        errorMessage
      );
      if (error) {
        info.lastError = new Error(error.message);
      }
    }
  }
}

export = TransportController;
