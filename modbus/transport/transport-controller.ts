// modbus/transport/transport-controller.ts

import { pino, Logger } from 'pino';
import * as utils from '../utils/utils.js';
import PollingManager from '../polling-manager.js';

import { Mutex } from 'async-mutex';
import { TransportFactory } from './modules/transport-factory.js';
import { EConnectionErrorType } from '../types/modbus-types.js';
import { DeviceConnectionTracker } from './trackers/DeviceConnectionTracker.js';
import { PortConnectionTracker } from './trackers/PortConnectionTracker.js';
import { RSModeConstraintError } from '../errors.js';

import type {
  ITransport,
  ITransportInfo,
  ITransportStatus,
  IPollingTaskOptions,
  IWebSerialPort,
  INodeSerialTransportOptions,
  IWebSerialTransportOptions,
  IPollingManagerConfig,
  IPollingQueueInfo,
  TLoadBalancerStrategy,
  TDeviceStateHandler,
  TPortStateHandler,
  TRSMode,
  ITransportController,
} from '../types/modbus-types.js';

/**
 * TransportController.
 * The central hub managing the lifecycle of all transport connections (Node/Web Serial, TCP).
 * It handles request routing to devices (Slave IDs), load balancing across multiple channels,
 * connection state tracking, and provides a proxy interface for polling management.
 */
class TransportController implements ITransportController {
  /** Internal registry of all added transports */
  private transports: Map<string, ITransportInfo> = new Map();
  /** Routing map: SlaveID -> Array of Transport IDs capable of reaching it */
  private slaveTransportMap: Map<number, string[]> = new Map();
  /** Current load balancing strategy for selecting a transport when multiple are available */
  private loadBalancerStrategy: TLoadBalancerStrategy = 'first-available';
  /** Winston logger instance for controller-level logging */
  public logger: Logger;

  /**
   * Mutex to protect the transport registry from race conditions.
   * Locks add/remove/reload/destroy operations to ensure atomicity.
   */
  private readonly _registryMutex = new Mutex();

  // Load balancer internal state
  private _roundRobinIndex: number = 0;
  private readonly _stickyMap = new Map<number, string>();

  // Tracking and callback maps
  private transportToDeviceTrackerMap: Map<string, DeviceConnectionTracker> = new Map();
  private transportToPortTrackerMap: Map<string, PortConnectionTracker> = new Map();
  private transportToDeviceHandlerMap: Map<string, TDeviceStateHandler> = new Map();
  private transportToPortHandlerMap: Map<string, TPortStateHandler> = new Map();

  // Global external handlers
  private _externalDeviceStateHandler: TDeviceStateHandler | null = null;
  private _externalPortStateHandler: TPortStateHandler | null = null;

  /**
   * Initializes the TransportController with a custom formatted logger.
   */
  constructor() {
    this.logger = pino({
      level: 'info',
      base: { component: 'Transport Controller' },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:mm:ss',
                ignore: 'pid,hostname,component',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    this.logger.debug('Transport Controller initialized');
  }

  /**
   * Sets a global handler for device connection state changes.
   * Triggered when any device on any transport changes its connection status.
   * @param handler - The callback function.
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._externalDeviceStateHandler = handler;
  }

  /**
   * Sets a global handler for port/transport connection state changes.
   * Triggered when any physical transport connects or disconnects.
   * @param handler - The callback function.
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._externalPortStateHandler = handler;
  }

  /**
   * Adds a new transport to the controller.
   * Validates RSMode constraints (e.g., RS232 single-device limit) and initializes polling.
   *
   * @param id - Unique identifier for the transport.
   * @param type - Connection type ('node' | 'web' | 'node-tcp' | 'web-tcp').
   * @param options - Transport-specific configuration (baud rate, host, slaveIds, etc.).
   * @param reconnectOptions - Auto-reconnection settings.
   * @param pollingConfig - Internal PollingManager configuration.
   * @throws RSModeConstraintError If RS232 is assigned more than one device.
   * @throws Error If transport ID is already taken or duplicate Slave IDs are provided.
   */
  async addTransport(
    id: string,
    type: 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator',
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: IPollingManagerConfig
  ): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      if (this.transports.has(id)) {
        throw new Error(`Transport with id "${id}" already exists`);
      }

      const rsMode = options.RSMode;
      const slaveIds = (options as any).slaveIds || [];

      // Validate RS232 constraint (only one device allowed)
      if (rsMode === 'RS232' && slaveIds.length > 1) {
        throw new RSModeConstraintError(
          `Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device. Provided ${slaveIds.length} devices.`
        );
      }

      // Create instance via factory
      const transport = await TransportFactory.create(type, options, this.logger);

      // Check for duplicate Slave IDs within this transport
      const seenSlaveIds = new Set<number>();
      for (const slaveId of slaveIds) {
        if (seenSlaveIds.has(slaveId)) {
          throw new Error(
            `Duplicate slave ID ${slaveId} provided for transport "${id}". Each slave ID must be unique per transport.`
          );
        }
        seenSlaveIds.add(slaveId);
      }

      const fallbacks = (options as any).fallbacks || [];

      // Init Polling Manager
      const pollingManager = new PollingManager(pollingConfig);

      const info: ITransportInfo = {
        id,
        type,
        transport,
        pollingManager,
        status: 'disconnected',
        slaveIds,
        rsMode: transport.getRSMode(),
        fallbacks,
        createdAt: new Date(),
        reconnectAttempts: 0,
        maxReconnectAttempts: reconnectOptions?.maxReconnectAttempts ?? 5,
        reconnectInterval: reconnectOptions?.reconnectInterval ?? 2000,
      };

      this.transports.set(id, info);

      // Init trackers
      const deviceTracker = new DeviceConnectionTracker();
      const portTracker = new PortConnectionTracker();

      this.transportToDeviceTrackerMap.set(id, deviceTracker);
      this.transportToPortTrackerMap.set(id, portTracker);

      // Subscribe to transport events
      transport.setDeviceStateHandler((slaveId: number, connected: boolean, error: any) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      transport.setPortStateHandler((connected: any, slaveIds: any, error: any) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      // Update global routing map
      this._updateSlaveTransportMap(id, slaveIds);

      this.logger.info(`Transport "${id}" added with PollingManager`);
    });
  }

  /**
   * Removes a transport, stops all its polling tasks, and closes the connection.
   * @param id - The ID of the transport to remove.
   */
  async removeTransport(id: string): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) return;

      info.pollingManager.clearAll();

      // Safe internal disconnect
      await this._disconnectTransportInternal(id);

      this.transports.delete(id);

      // Cleanup trackers and maps
      this.transportToDeviceTrackerMap.delete(id);
      this.transportToPortTrackerMap.delete(id);
      this.transportToDeviceHandlerMap.delete(id);
      this.transportToPortHandlerMap.delete(id);

      // Remove from routing map
      for (const [slaveId, list] of this.slaveTransportMap.entries()) {
        const updated = list.filter(tid => tid !== id);
        if (updated.length === 0) {
          this.slaveTransportMap.delete(slaveId);
        } else {
          this.slaveTransportMap.set(slaveId, updated);
        }
      }

      this.logger.info(`Transport "${id}" removed`);
    });
  }

  // =========================================================
  // Polling Manager Proxy Methods
  // =========================================================

  /**
   * Helper to retrieve transport info or throw if missing.
   */
  private _getTransportInfo(transportId: string): ITransportInfo {
    const info = this.transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info;
  }

  /**
   * Adds a polling task to the specified transport's manager.
   * @param transportId - Target transport ID.
   * @param options - Polling task parameters.
   */
  public addPollingTask(transportId: string, options: IPollingTaskOptions): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.addTask(options);
  }

  /**
   * Removes a specific polling task from a transport.
   * @param transportId - Target transport ID.
   * @param taskId - Task ID to remove.
   */
  public removePollingTask(transportId: string, taskId: string): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.removeTask(taskId);
  }

  /**
   * Updates configuration for an existing polling task.
   * @param transportId - Target transport ID.
   * @param taskId - Task ID to update.
   * @param newOptions - New parameters.
   */
  public updatePollingTask(
    transportId: string,
    taskId: string,
    newOptions: IPollingTaskOptions
  ): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.updateTask(taskId, newOptions);
  }

  /**
   * Controls the state of a specific task (start/stop/pause/resume).
   * @param transportId - Target transport ID.
   * @param taskId - Task ID.
   * @param action - Action to perform.
   */
  public controlTask(
    transportId: string,
    taskId: string,
    action: 'start' | 'stop' | 'pause' | 'resume'
  ): void {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case 'start':
        info.pollingManager.startTask(taskId);
        break;
      case 'stop':
        info.pollingManager.stopTask(taskId);
        break;
      case 'pause':
        info.pollingManager.pauseTask(taskId);
        break;
      case 'resume':
        info.pollingManager.resumeTask(taskId);
        break;
    }
  }

  /**
   * Controls the state of all tasks on a specific transport.
   * @param transportId - Target transport ID.
   * @param action - Bulk action to perform.
   */
  public controlPolling(
    transportId: string,
    action: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'
  ): void {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case 'startAll':
        info.pollingManager.startAllTasks();
        break;
      case 'stopAll':
        info.pollingManager.stopAllTasks();
        break;
      case 'pauseAll':
        info.pollingManager.pauseAllTasks();
        break;
      case 'resumeAll':
        info.pollingManager.resumeAllTasks();
        break;
    }
  }

  /**
   * Retrieves status and statistics of the polling queue for a transport.
   * @param transportId - Target transport ID.
   * @returns Polling queue information.
   */
  public getPollingQueueInfo(transportId: string): IPollingQueueInfo {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getQueueInfo();
  }

  /**
   * Executes a function (e.g., Modbus Write) using the PollingManager's mutex.
   * This ensures the operation is atomic and doesn't collide with background polling.
   * @param transportId - Target transport ID.
   * @param fn - Async function to execute.
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.executeImmediate(fn);
  }

  /**
   * Returns the transport instance for a given ID.
   * @param id - Transport ID.
   */
  getTransport(id: string): ITransport | null {
    const info = this.transports.get(id);
    return info ? info.transport : null;
  }

  /**
   * Returns a list of all registered transports and their metadata.
   */
  listTransports(): ITransportInfo[] {
    return Array.from(this.transports.values());
  }

  /**
   * Initiates connection for all registered transports.
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.transports.values()).map(info =>
      this.connectTransport(info.id)
    );
    await Promise.all(promises);
  }

  /**
   * Disconnects all registered transports.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.transports.values()).map(info =>
      this.disconnectTransport(info.id)
    );
    await Promise.all(promises);
  }

  /**
   * Connects a specific transport.
   * Resumes polling upon successful connection.
   * @param id - Transport ID.
   */
  async connectTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);
    if (info.status === 'connecting' || info.status === 'connected') return;

    info.status = 'connecting';
    try {
      await info.transport.connect();
      info.status = 'connected';
      info.reconnectAttempts = 0;

      // Resume polling
      info.pollingManager.resumeAllTasks();

      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = 'error';
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        { transportId: id, err: info.lastError.message },
        'Failed to connect transport'
      );

      // Internal auto-reconnect logic
      if (info.reconnectAttempts < info.maxReconnectAttempts) {
        info.reconnectAttempts++;
        setTimeout(
          () => this.connectTransport(id),
          info.reconnectInterval * info.reconnectAttempts
        );
      } else {
        this.logger.error(`Max reconnection attempts reached for "${id}"`);
      }

      throw err;
    }
  }

  /**
   * Disconnects a specific transport.
   * @param id - Transport ID.
   */
  async disconnectTransport(id: string): Promise<void> {
    await this._disconnectTransportInternal(id);
  }

  /**
   * Internal disconnect implementation.
   * Pauses polling and closes the transport without checking registry mutex.
   */
  private async _disconnectTransportInternal(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) return;

    try {
      info.pollingManager.pauseAllTasks();

      await info.transport.disconnect();
      info.status = 'disconnected';
      this.logger.info(`Transport "${id}" disconnected`);
    } catch (err) {
      this.logger.error(
        { transportId: id, err: (err as Error).message },
        'Error disconnecting transport'
      );
    }
  }

  /**
   * Binds a new Slave ID to an existing transport.
   * Updates routing so requests for this slave are directed to this transport.
   * @param transportId - Target transport.
   * @param slaveId - Modbus unit identifier.
   * @throws RSModeConstraintError if RS232 already has a device.
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): void {
    const info = this.transports.get(transportId);
    if (!info) {
      throw new Error(`Transport with id "${transportId}" not found`);
    }

    if (info.rsMode === 'RS232' && info.slaveIds.length >= 1) {
      const existingSlaveId = info.slaveIds[0];
      throw new RSModeConstraintError(
        `Cannot assign slaveId ${slaveId} to transport "${transportId}". It is in 'RS232' mode and already manages device ${existingSlaveId}.`
      );
    }

    if (info.slaveIds.includes(slaveId)) {
      throw new Error(
        `Cannot assign slave ID ${slaveId}". The transport is already managing this ID.`
      );
    }

    info.slaveIds.push(slaveId);
    this._updateSlaveTransportMap(transportId, [slaveId]);
    this.logger.info(`Assigned slaveId ${slaveId} to transport "${transportId}"`);
  }

  /**
   * Unbinds a Slave ID from a transport and cleans up its state in trackers.
   * @param transportId - Transport ID.
   * @param slaveId - Modbus unit identifier.
   */
  removeSlaveIdFromTransport(transportId: string, slaveId: number): void {
    const info = this.transports.get(transportId);
    if (!info) {
      this.logger.warn(
        `Attempted to remove slaveId ${slaveId} from non-existent transport "${transportId}"`
      );
      return;
    }

    const index = info.slaveIds.indexOf(slaveId);
    if (index !== -1) {
      info.slaveIds.splice(index, 1);
    } else {
      this.logger.warn(`SlaveId ${slaveId} was not found in transport "${transportId}"`);
      return;
    }

    // Update routing map
    const transportList = this.slaveTransportMap.get(slaveId);
    if (transportList) {
      const updatedList = transportList.filter(tid => tid !== transportId);
      if (updatedList.length === 0) {
        this.slaveTransportMap.delete(slaveId);
      } else {
        this.slaveTransportMap.set(slaveId, updatedList);
      }
    }

    // Clear sticky sessions
    const stickyTransport = this._stickyMap.get(slaveId);
    if (stickyTransport === transportId) {
      this._stickyMap.delete(slaveId);
    }

    // Remove from trackers
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (tracker) {
      try {
        tracker.removeState(slaveId);
      } catch (err: any) {
        this.logger.warn(
          `Failed to remove state for slaveId ${slaveId} from tracker: ${err.message}`
        );
      }
    }

    // Call optional removal method on the transport
    const transportAny = info.transport as any;
    if (typeof transportAny.removeConnectedDevice === 'function') {
      transportAny.removeConnectedDevice(slaveId);
    }

    this.logger.info(`Removed slaveId ${slaveId} from transport "${transportId}"`);
  }

  /**
   * Hot-reloads a transport with new configuration options.
   * Useful for changing Baud Rate or Host without restarting the application.
   * @param id - Transport ID.
   * @param options - New options.
   */
  async reloadTransport(
    id: string,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort })
  ): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) throw new Error(`Transport with id "${id}" not found`);

      const wasConnected = info.status === 'connected';

      info.pollingManager.clearAll();

      await this._disconnectTransportInternal(id);

      // Recreate transport instance
      const newTransport = await TransportFactory.create(info.type, options, this.logger);

      // Re-init trackers
      const deviceTracker = new DeviceConnectionTracker();
      const portTracker = new PortConnectionTracker();

      this.transportToDeviceTrackerMap.set(id, deviceTracker);
      this.transportToPortTrackerMap.set(id, portTracker);

      // Restore event listeners
      newTransport.setDeviceStateHandler((slaveId: number, connected: boolean, error: any) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      newTransport.setPortStateHandler((connected: any, slaveIds: any, error: any) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      // Restore custom handlers
      const deviceHandler = this.transportToDeviceHandlerMap.get(id);
      if (deviceHandler) {
        await deviceTracker.setHandler(deviceHandler);
      }

      const portHandler = this.transportToPortHandlerMap.get(id);
      if (portHandler) {
        await portTracker.setHandler(portHandler);
      }

      info.transport = newTransport;
      info.rsMode = newTransport.getRSMode();

      if (wasConnected) {
        await this.connectTransport(id);
      }

      this.logger.info(`Transport "${id}" reloaded with new options`);
    });
  }

  /**
   * Directly writes data to a transport's port via its PollingManager.
   * Guarantees atomic exchange (Write-then-Read if readLength > 0).
   * @param transportId - Target transport.
   * @param data - Raw byte data to send.
   * @param readLength - Expected response length.
   * @param timeout - Response timeout.
   * @returns Byte response from the device.
   */
  public async writeToPort(
    transportId: string,
    data: Uint8Array,
    readLength: number = 0,
    timeout: number = 3000
  ): Promise<Uint8Array> {
    const info = this._getTransportInfo(transportId);

    if (!info.transport.isOpen) {
      throw new Error(
        `Transport "${transportId}" is not open (connection status: ${info.status}).`
      );
    }

    return info.pollingManager.executeImmediate(async () => {
      await (info.transport as any).write(data);

      if (readLength > 0) {
        return (info.transport as any).read(readLength, timeout);
      }

      await (info.transport as any).flush();

      return utils.allocUint8Array(0);
    });
  }

  /**
   * Updates the internal SlaveID to Transport routing map.
   */
  private _updateSlaveTransportMap(id: string, slaveIds: number[]): void {
    for (const slaveId of slaveIds) {
      const list = this.slaveTransportMap.get(slaveId) || [];
      if (!list.includes(id)) {
        list.push(id);
        this.slaveTransportMap.set(slaveId, list);
      }
    }
  }

  /**
   * Finds the best available transport for a specific Slave ID based on mode and strategy.
   * @param slaveId - Modbus unit ID.
   * @param requiredRSMode - Protocol mode (RS485, RS232, TCP/IP).
   * @returns Transport instance or null if none found.
   */
  getTransportForSlave(slaveId: number, requiredRSMode: TRSMode): ITransport | null {
    const transportIds = this.slaveTransportMap.get(slaveId);

    if (transportIds && transportIds.length > 0) {
      let transport: ITransport | null = null;

      switch (this.loadBalancerStrategy) {
        case 'round-robin':
          transport = this._getTransportRoundRobin(transportIds);
          break;
        case 'sticky':
          transport = this._getTransportSticky(slaveId, transportIds);
          break;
        default:
          transport = this._getTransportFirstAvailable(transportIds);
          break;
      }

      if (transport) {
        const info = Array.from(this.transports.values()).find(i => i.transport === transport);
        if (info && info.rsMode === requiredRSMode) {
          return transport;
        }
      }
    }

    for (const info of this.transports.values()) {
      const isReadyOrConnecting = info.status === 'connected' || info.status === 'connecting';

      if (isReadyOrConnecting && info.rsMode === requiredRSMode) {
        if (requiredRSMode === 'RS485' || requiredRSMode === 'TCP/IP') {
          return info.transport;
        }
        if (requiredRSMode === 'RS232' && info.slaveIds.length === 0) {
          return info.transport;
        }
      }
    }

    this.logger.warn(
      `No connected transport found for slave ${slaveId} with required RSMode ${requiredRSMode}`
    );
    return null;
  }

  /**
   * Strategy: Cycle through available transports for balanced load.
   */
  private _getTransportRoundRobin(transportIds: string[]): ITransport | null {
    const connectedTransports = transportIds
      .map(id => this.transports.get(id))
      .filter((info): info is ITransportInfo => !!info && info.status === 'connected');

    if (connectedTransports.length === 0) {
      return this._getTransportFirstAvailable(transportIds);
    }

    this._roundRobinIndex = (this._roundRobinIndex + 1) % connectedTransports.length;
    const selectedInfo = connectedTransports[this._roundRobinIndex];

    return selectedInfo?.transport ?? null;
  }

  /**
   * Strategy: Always use the same transport for a specific Slave ID if it remains connected.
   */
  private _getTransportSticky(slaveId: number, transportIds: string[]): ITransport | null {
    const lastUsedId = this._stickyMap.get(slaveId);

    if (lastUsedId) {
      const info = this.transports.get(lastUsedId);
      if (info && info.status === 'connected' && transportIds.includes(lastUsedId)) {
        return info.transport;
      }
    }

    const transport = this._getTransportFirstAvailable(transportIds);
    if (transport) {
      const transportEntry = Array.from(this.transports.entries()).find(
        ([_id, info]) => info.transport === transport
      );
      if (transportEntry) {
        const newTransportId = transportEntry[0];
        this._stickyMap.set(slaveId, newTransportId);
      }
    }

    return transport;
  }

  /**
   * Strategy: Use the first connected transport found in the registry/list.
   */
  private _getTransportFirstAvailable(transportIds: string[]): ITransport | null {
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.status === 'connected') {
        return info.transport;
      }
    }

    // Check Fallback channels if primary is down
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.fallbacks) {
        for (const fallbackId of info.fallbacks) {
          const fallbackInfo = this.transports.get(fallbackId);
          if (fallbackInfo && fallbackInfo.status === 'connected') {
            return fallbackInfo.transport;
          }
        }
      }
    }

    return null;
  }

  /**
   * Returns diagnostic status for a specific transport or all registered ones.
   * @param id - Optional Transport ID.
   */
  getStatus(id?: string): ITransportStatus | Record<string, ITransportStatus> {
    if (id) {
      const info = this.transports.get(id);
      if (!info) return {} as ITransportStatus;

      return {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
      };
    }

    const result: Record<string, ITransportStatus> = {};
    for (const [tid, info] of this.transports) {
      result[tid] = {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
      };
    }
    return result;
  }

  /**
   * Returns the count of currently connected transports.
   */
  getActiveTransportCount(): number {
    let count = 0;
    for (const info of this.transports.values()) {
      if (info.status === 'connected') count++;
    }
    return count;
  }

  /**
   * Updates the global load balancing strategy.
   */
  setLoadBalancer(strategy: TLoadBalancerStrategy): void {
    this.loadBalancerStrategy = strategy;
  }

  /**
   * Attaches a device state handler to a specific transport tracker.
   */
  async setDeviceStateHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void> {
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (!tracker) {
      throw new Error(`No device tracker found for transport "${transportId}"`);
    }

    await tracker.setHandler(handler);
    this.transportToDeviceHandlerMap.set(transportId, handler);
  }

  /**
   * Attaches a port state handler to a specific transport tracker.
   */
  async setPortStateHandlerForTransport(
    transportId: string,
    handler: TPortStateHandler
  ): Promise<void> {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      throw new Error(`No port tracker found for transport "${transportId}"`);
    }

    await tracker.setHandler(handler);
    this.transportToPortHandlerMap.set(transportId, handler);
  }

  /**
   * Internal bridge for device state events.
   * Updates trackers and notifies global/local handlers.
   */
  private _onDeviceStateChange(
    transportId: string,
    slaveId: number,
    connected: boolean,
    error?: { type: EConnectionErrorType; message: string }
  ): void {
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No device tracker found for transport "${transportId}"`);
      return;
    }

    if (connected) {
      tracker.notifyConnected(slaveId);
    } else {
      const errorType = (error?.type as EConnectionErrorType) || EConnectionErrorType.UnknownError;
      const errorMessage = error?.message || 'Device disconnected';
      tracker.notifyDisconnected(slaveId, errorType, errorMessage);
    }

    const handler = this.transportToDeviceHandlerMap.get(transportId);
    if (handler) {
      handler(slaveId, connected, error);
    }

    if (this._externalDeviceStateHandler) {
      this._externalDeviceStateHandler(slaveId, connected, error);
    }
  }

  /**
   * Internal bridge for port/socket state events.
   * Updates trackers, pauses/resumes polling, and notifies global/local handlers.
   */
  private _onPortStateChange(
    transportId: string,
    connected: boolean,
    slaveIds?: number[],
    error?: { type: string; message: string }
  ): void {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No port tracker found for transport "${transportId}"`);
      return;
    }

    const info = this.transports.get(transportId);

    if (connected) {
      tracker.notifyConnected();
      if (info) info.pollingManager.resumeAllTasks();
    } else {
      const errorType = (error?.type as EConnectionErrorType) || EConnectionErrorType.UnknownError;
      const errorMessage = error?.message || 'Port disconnected';
      tracker.notifyDisconnected(errorType, errorMessage, slaveIds);

      if (info) info.pollingManager.pauseAllTasks();
    }

    if (info) {
      info.status = connected ? 'connected' : 'disconnected';
      if (!connected && error) {
        info.lastError = new Error(error?.message);
      }
    }

    const handler = this.transportToPortHandlerMap.get(transportId);
    if (handler) {
      handler(connected, slaveIds, error as any);
    }

    if (this._externalPortStateHandler) {
      this._externalPortStateHandler(connected, slaveIds, error as any);
    }
  }

  /**
   * Fully shuts down the controller.
   * Stops all polling, disconnects all transports, and clears memory.
   * Mutex-protected to prevent race conditions during shutdown.
   */
  async destroy(): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      for (const info of this.transports.values()) {
        info.pollingManager.clearAll();
      }

      await Promise.all(
        Array.from(this.transports.values()).map(info => this._disconnectTransportInternal(info.id))
      );

      this.transports.clear();
      this.slaveTransportMap.clear();

      for (const tracker of this.transportToDeviceTrackerMap.values()) {
        await tracker.clear();
      }
      for (const tracker of this.transportToPortTrackerMap.values()) {
        await tracker.clear();
      }
      this.transportToDeviceTrackerMap.clear();
      this.transportToPortTrackerMap.clear();
      this.transportToDeviceHandlerMap.clear();
      this.transportToPortHandlerMap.clear();

      this._externalDeviceStateHandler = null;
      this._externalPortStateHandler = null;
    });

    this.logger.info('Transport Controller destroyed');
  }
}

export = TransportController;
