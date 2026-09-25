// modbus/transport/controller/index.ts

import { Mutex } from 'async-mutex';
import { Logger, type ILogObj } from 'tslog';
import { createTsLogger, type TTsLogLevel } from '../../utils/logger.js';
import { TransportFactory } from '../factory.js';
import { TransportRegistry } from './registry/TransportRegistry.js';
import { TransportRouter } from './router/TransportRouter.js';
import { StateManager } from './state/StateManager.js';
import { PollingProxy } from './polling/PollingProxy.js';
import { ScanService } from './scan/ScanService.js';
import { PortSession } from './session/PortSession.js';
import { TrafficSniffer } from '../trackers/traffic-sniffer.js';
import { ClientRegistry } from './registry/ClientRegistry.js';
import ModbusClient from '../../core/client.js';
import * as utils from '../../utils/buffer.js';
import { ScanController } from '../../utils/scanner.js';
import { rsModeToFraming } from '../../protocol/framing.js';
import {
  ClientAlreadyExistsError,
  DuplicateSlaveIdError,
  ClientNotFoundError,
  ModbusInvalidAddressError,
  ModbusNotConnectedError,
  RSModeConstraintError,
} from '../../core/errors.js';

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
  IClientInfo,
  ICreateClientOptions,
  IReassignClientOptions,
  IPortSession,
  IPollingManagerConfig,
  IPortQueueOptions,
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
  public logger: Logger<ILogObj>;

  private readonly _registry: TransportRegistry;
  private readonly _clientRegistry = new ClientRegistry();
  private readonly _router: TransportRouter;
  private readonly _stateManager: StateManager;
  private readonly _pollingProxy: PollingProxy;
  private readonly _scanService: ScanService;

  private _sniffer: TrafficSniffer | null = null;

  /**
   * Returns the traffic sniffer instance if enabled, otherwise null.
   * @returns {TrafficSniffer | null} The traffic sniffer instance or null if not enabled.
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
   * Disables the internal logger, silencing all log output.
   * @returns {void}
   */
  public disableLogger(): void {
    this.logger = this._createLogger('silent');
  }

  /**
   * Enables the internal logger with 'info' level, allowing log output to be printed.
   * @returns {void}
   */
  public enableLogger(): void {
    this.logger = this._createLogger('info');
  }

  /**
   * Creates a new logger instance with the specified log level.
   * @param level - The log level for the logger (default is 'info').
   * @returns {Logger<ILogObj>} A new logger instance.
   */
  private _createLogger(level: TTsLogLevel = 'info'): Logger<ILogObj> {
    return createTsLogger({ name: 'Transport Controller', level });
  }

  // ==================== Scan ====================

  /**
   * Pauses the currently active scan operation, if any.
   * This is useful when a scan needs to be temporarily halted without losing its state.
   * @returns {void}
   */
  public pauseScan(): void {
    this._scanService.pause();
  }

  /**
   * Resumes a previously paused scan operation.
   * This allows the scan to continue from where it left off.
   * @returns {void}
   */
  public resumeScan(): void {
    this._scanService.resume();
  }

  /**
   * Stops the currently active scan operation and clears its state.
   * This is useful when a scan needs to be completely terminated.
   * @returns {void}
   */
  public stopScan(): void {
    this._scanService.stop();
  }

  /**
   * Performs a scan on a Serial/RTU port to discover Modbus devices.
   * @param {IScanOptions} options - Scan parameters (baud rates, slave IDs, etc.).
   * @returns {Promise<IScanReport>} Result of the discovery process.
   */
  public async scanRtuPort(options: IScanOptions): Promise<IScanReport> {
    this.logger.info('Starting RTU scan');
    return this._scanService.scanRtu(options, options.controller as ScanController | undefined, {
      pauseSession: scanOptions => this.pauseSessionForScan(scanOptions),
      resumeSession: scanOptions => this.resumeSessionAfterScan(scanOptions),
    });
  }

  /**
   * Performs a scan on a Network/TCP port to discover Modbus units.
   * @param {IScanOptions} options - Scan parameters (hosts, ports, unit IDs).
   * @returns {Promise<IScanReport>} Result of the discovery process.
   */
  public async scanTcpPort(options: IScanOptions): Promise<IScanReport> {
    this.logger.info('Starting TCP scan');
    return this._scanService.scanTcp(options, options.controller as ScanController | undefined, {
      pauseSession: scanOptions => this.pauseSessionForScan(scanOptions),
      resumeSession: scanOptions => this.resumeSessionAfterScan(scanOptions),
    });
  }

  /**
   * Pauses the port session associated with a scan operation.
   * @param options - Scan parameters to identify the session to pause.
   * @returns {Promise<void>} A promise that resolves when the session has been paused.
   */
  public async pauseSessionForScan(options: IScanOptions): Promise<void> {
    const session = this._findSessionByScanPath(options);
    if (!session) return;
    await session.pauseForScan();
    this.logger.info({ transportId: session.id }, 'Port paused for scan');
  }

  /**
   * Resumes the port session associated with a scan operation after the scan is complete.
   * @param options - Scan parameters to identify the session to resume.
   * @returns {Promise<void>} A promise that resolves when the session has been resumed.
   */
  public async resumeSessionAfterScan(options: IScanOptions): Promise<void> {
    const session = this._findSessionByScanPath(options);
    if (!session) return;
    await session.resumeAfterScan();
    this.logger.info({ transportId: session.id }, 'Port resumed after scan');
  }

  /**
   * Finds a port session based on the scan options provided.
   * @param options - Scan parameters to identify the session.
   * @returns {PortSession | undefined} The found port session or undefined if not found.
   */
  private _findSessionByScanPath(options: IScanOptions): PortSession | undefined {
    const sessions = this._registry.getAll();
    const scanPath = options.path;

    if (typeof scanPath === 'string' && scanPath) {
      const byPath = sessions.find(session => (session.transport as any).path === scanPath);
      if (byPath) return byPath;
    }

    if (Array.isArray(options.hosts) && options.hosts.length > 0) {
      const wantedHosts = new Set(options.hosts);
      const wantedPorts =
        Array.isArray(options.ports) && options.ports.length > 0
          ? new Set(options.ports)
          : undefined;

      return sessions.find(session => {
        const transport = session.transport as any;
        return (
          typeof transport?.host === 'string' &&
          wantedHosts.has(transport.host) &&
          (!wantedPorts || wantedPorts.has(transport.port))
        );
      });
    }

    return undefined;
  }

  // ==================== Transport CRUD ====================

  /**
   * Adds and initializes a new transport (creates its PortSession).
   * The port slave inventory is not configured here any more: it is maintained
   * automatically by createClient()/removeClient().
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
    pollingConfig?: IPollingManagerConfig,
    queueOptions?: IPortQueueOptions
  ): Promise<void> {
    await this._mutex.runExclusive(async () => {
      if (this._registry.has(id)) {
        throw new Error(`Transport with id "${id}" already exists`);
      }

      const transport = await TransportFactory.create(type, options, this.logger, this._sniffer);

      // The controller no longer keeps a loose "transport info" record: it creates the
      // port owner (transport + queue + exactly one PollingManager + port tracker).
      const session = new PortSession(transport, {
        id,
        type,
        fallbacks: (options as any).fallbacks || [],
        maxReconnectAttempts: reconnectOptions?.maxReconnectAttempts,
        reconnectInterval: reconnectOptions?.reconnectInterval,
        queue: queueOptions,
        pollingConfig,
      });
      await this._registry.add(session);
      this._stateManager.createDeviceTrackerForTransport(id);

      this._wireTransportHandlers(session);
      // A hot reload replaces the transport, so the session must be able to rewire it.
      session.setTransportHandlerInstaller(target => this._wireTransportHandlers(target));

      this.logger.info(`Transport "${id}" added with PollingManager`);
    });
  }

  /**
   * Removes a transport, stops its polling, and cleans up its resources.
   * @param {string} id - The ID of the transport to remove.
   * @returns {Promise<void>} A promise that resolves when the transport has been removed.
   */
  public async removeTransport(id: string): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const session = this._registry.get(id);
      if (!session) return;

      await this._removeClientsOfSession(id);

      // The session releases its own resources (polling, queue, transport, port tracker).
      await session.destroy();
      this._registry.clearSlaveAssignments(id);

      const transportAny = session.transport as any;
      if (typeof transportAny.removeConnectedDevice === 'function') {
        for (const sid of session.slaveIds) {
          transportAny.removeConnectedDevice(sid);
        }
      }

      await this._stateManager.clearTransport(id);
      await this._registry.remove(id);

      this.logger.info(`Transport "${id}" removed`);
    });
  }

  /**
   * Returns the transport instance for a given transport ID.
   * @param id - The transport ID to look up.
   * @returns {ITransport | null} The transport instance or null if not found.
   */
  public getTransport(id: string): ITransport | null {
    return this._registry.get(id)?.transport ?? null;
  }

  /**
   * Returns the port session for a given transport ID.
   * @param id - The transport ID to look up.
   * @returns {IPortSession | null} The port session or null if not found.
   */
  public getSession(id: string): IPortSession | null {
    return this._registry.get(id) ?? null;
  }

  /**
   * Lists all registered transports with their current status and configuration.
   * @returns {ITransportInfo[]} An array of transport information objects.
   */
  public listTransports(): ITransportInfo[] {
    return this._registry.getAll().map(session => this._toTransportInfo(session));
  }

  /**
   * Converts a PortSession to a transport information object.
   * @param session - The PortSession instance to convert.
   * @returns {ITransportInfo} The transport information object.
   */
  private _toTransportInfo(session: PortSession): ITransportInfo {
    return {
      id: session.id,
      type: session.type as TTransportType,
      transport: session.transport,
      pollingManager: session.pollingManager,
      status: session.status,
      slaveIds: [...session.slaveIds],
      rsMode: session.rsMode,
      fallbacks: [...session.fallbacks],
      createdAt: session.createdAt,
      lastError: session.lastError,
      reconnectAttempts: session.reconnectAttempts,
      maxReconnectAttempts: session.maxReconnectAttempts,
      reconnectInterval: session.reconnectInterval,
    };
  }

  // ==================== Client Roster ====================

  /**
   * Creates a client bound to a port session and registers it on this controller.
   * - `framing` is derived from the port RS mode (RS485/RS232 -> rtu, TCP/IP -> tcp);
   * - the port's slave inventory is updated automatically;
   * - the client owns an isolated device tracker.
   */
  public async createClient(options: ICreateClientOptions): Promise<ModbusClient> {
    return await this._mutex.runExclusive(async () => {
      const { slaveId } = options;

      if (!Number.isInteger(slaveId) || slaveId < 0 || slaveId > 255) {
        throw new ModbusInvalidAddressError(slaveId);
      }

      const session = this._resolveSessionForClient(options);
      const clientId = options.clientId ?? this._clientRegistry.nextClientId();

      if (this._clientRegistry.has(clientId)) {
        throw new ClientAlreadyExistsError(clientId);
      }

      // RS232 ports can serve exactly one device.
      if (
        session.rsMode === 'RS232' &&
        session.slaveIds.length >= 1 &&
        !session.slaveIds.includes(slaveId)
      ) {
        throw new RSModeConstraintError(
          `Transport "${session.id}" is RS232 and already has device ${session.slaveIds[0]}`
        );
      }

      // One device — one client: two masters at a single address double the bus traffic and
      // render the device's connection state ambiguous.
      const duplicate = this._clientRegistry
        .getByTransport(session.id)
        .find(other => other.info.slaveId === slaveId);

      if (duplicate) {
        if (!options.allowDuplicateSlaveId) {
          throw new DuplicateSlaveIdError(session.id, slaveId, duplicate.info.clientId);
        }
        this.logger.warn(
          { slaveId, transportId: session.id, clients: [duplicate.info.clientId, clientId] },
          'Two clients serve the same device (allowDuplicateSlaveId)'
        );
      }

      const framing = rsModeToFraming(session.rsMode);
      const client = new ModbusClient(
        this,
        slaveId,
        {
          // Explicitly listed: the port itself determines the framing/RS mode and owns the session.
          // The new client option must be added here as well; otherwise, it will be silently lost.
          RSMode: session.rsMode,
          timeout: options.timeout,
          totalTimeout: options.totalTimeout,
          retryCount: options.retryCount,
          retryDelay: options.retryDelay,
          echo: options.echo,
          plugins: options.plugins,
        },
        { clientId, session, framing, rsMode: session.rsMode }
      );

      this._registry.assignSlave(session.id, slaveId);
      this._clientRegistry.add(clientId, client, {
        clientId,
        slaveId,
        transportId: session.id,
        rsMode: session.rsMode,
        framing,
        createdAt: new Date(),
      });
      session.clients.set(clientId, client);

      this.logger.info({ clientId, slaveId, transportId: session.id, framing }, 'Client created');
      return client;
    });
  }

  /**
   * Retrieves a registered client by its unique identifier.
   * @param clientId - The unique identifier of the client to retrieve.
   * @returns {ModbusClient | null} The ModbusClient instance if found, otherwise null.
   */
  public getClient(clientId: string): ModbusClient | null {
    return this._clientRegistry.get(clientId) ?? null;
  }

  /**
   * Reassigns a client to a new Slave ID, updating the transport's slave inventory and device state.
   * @param clientId - The unique identifier of the client to reassign.
   * @param newSlaveId - The new Slave ID to assign to the client (must be an integer between 1 and 255).
   * @param options - Optional settings for the reassignment, such as allowing duplicate Slave IDs.
   * @throws {ModbusInvalidAddressError} If the new Slave ID is invalid.
   * @throws {ClientNotFoundError} If the client with the specified ID does not exist.
   * @throws {RSModeConstraintError} If the transport is RS232 and already has a device assigned.
   * @throws {DuplicateSlaveIdError} If another client already serves the new Slave ID and duplicates are not allowed.
   */
  public async reassignClient(
    clientId: string,
    newSlaveId: number,
    options?: IReassignClientOptions
  ): Promise<void> {
    if (!Number.isInteger(newSlaveId) || newSlaveId < 1 || newSlaveId > 255) {
      throw new ModbusInvalidAddressError(newSlaveId);
    }

    await this._mutex.runExclusive(async () => {
      const entry = this._clientRegistry.getEntry(clientId);
      if (!entry) throw new ClientNotFoundError(clientId);

      const oldSlaveId = entry.info.slaveId;
      if (oldSlaveId === newSlaveId) return;

      const session = this._registry.get(entry.info.transportId);
      if (session) {
        if (
          session.rsMode === 'RS232' &&
          session.slaveIds.length >= 1 &&
          !session.slaveIds.includes(newSlaveId)
        ) {
          throw new RSModeConstraintError(
            `Transport "${session.id}" is RS232 and already has device ${session.slaveIds[0]}`
          );
        }

        // The new address must not already be in use by another client of this port.
        const conflict = this._clientRegistry
          .getByTransport(session.id)
          .find(other => other.info.clientId !== clientId && other.info.slaveId === newSlaveId);

        if (conflict) {
          if (!options?.allowDuplicateSlaveId) {
            throw new DuplicateSlaveIdError(session.id, newSlaveId, conflict.info.clientId);
          }
          this.logger.warn(
            {
              slaveId: newSlaveId,
              transportId: session.id,
              clients: [conflict.info.clientId, clientId],
            },
            'Two clients serve the same device (allowDuplicateSlaveId)'
          );
        }

        const stillUsed = this._clientRegistry
          .getByTransport(session.id)
          .some(other => other.info.clientId !== clientId && other.info.slaveId === oldSlaveId);

        if (!stillUsed) {
          this._registry.unassignSlave(session.id, oldSlaveId);
          this._stateManager.removeDeviceState(oldSlaveId, session.id);
        }
        this._registry.assignSlave(session.id, newSlaveId);
      }

      entry.client.applySlaveId(newSlaveId);
      entry.info.slaveId = newSlaveId;

      this.logger.info({ clientId, from: oldSlaveId, to: newSlaveId }, 'Client re-assigned');
    });
  }

  /**
   * Lists all registered clients, optionally filtered by transport ID.
   * @param transportId - Optional transport ID to filter clients by.
   * @returns {IClientInfo[]} An array of client information objects.
   */
  public listClients(transportId?: string): IClientInfo[] {
    return transportId
      ? this._clientRegistry.getByTransport(transportId).map(entry => ({ ...entry.info }))
      : this._clientRegistry.getAll();
  }

  /**
   * Removes a client from the controller, cleaning up its resources and updating the transport's slave inventory.
   * @param clientId - The unique identifier of the client to remove.
   * @returns {Promise<void>} A promise that resolves when the client has been removed.
   */
  public async removeClient(clientId: string): Promise<void> {
    await this._mutex.runExclusive(async () => {
      if (!this._clientRegistry.has(clientId)) {
        // Repeated removal is not an error: cleanup chains (disconnect -> removeClient ->
        // removeTransport) must execute successfully even when the client has already been removed.
        return;
      }
      await this._removeClientInternal(clientId);
    });
  }

  /**
   * Internal method to remove a client, cleaning up its resources and updating the transport's slave inventory.
   * @param clientId - The unique identifier of the client to remove.
   * @returns {Promise<void>} A promise that resolves when the client has been removed.
   */
  private async _removeClientInternal(clientId: string): Promise<void> {
    const entry = this._clientRegistry.getEntry(clientId);
    if (!entry) return;

    const { slaveId, transportId } = entry.info;
    const session = this._registry.get(transportId);

    // The client must not keep pointing at a port it no longer belongs to.
    entry.client.detachSession();

    if (session) {
      // Polling tasks owned by this client (IPollingTaskOptions.clientId) must not survive it.
      const removedTasks = session.pollingManager.removeTasksByClient(clientId);
      if (removedTasks.length > 0) {
        this.logger.info({ clientId, tasks: removedTasks }, 'Client polling tasks removed');
      }

      // The client's personal device tracker goes away with the client.
      await entry.client.clearDeviceState();

      const stillUsed = this._clientRegistry
        .getByTransport(transportId)
        .some(other => other.info.clientId !== clientId && other.info.slaveId === slaveId);

      if (!stillUsed) {
        this._registry.unassignSlave(session.id, slaveId);
        this._stateManager.removeDeviceState(slaveId, session.id);
      }

      session.clients.delete(clientId);
    }

    this._clientRegistry.remove(clientId);
    this.logger.info({ clientId }, 'Client removed');
  }

  /**
   * Removes every client that lives on a port session.
   * @param transportId - The ID of the transport session.
   * @returns {Promise<void>} A promise that resolves when all clients have been removed.
   * @private
   */
  private async _removeClientsOfSession(transportId: string): Promise<void> {
    for (const entry of this._clientRegistry.getByTransport(transportId)) {
      await this._removeClientInternal(entry.info.clientId);
    }
  }

  /**
   * Resolves the appropriate port session for a client based on the provided options.
   * @param options - Options containing transport ID, slave ID, and RS mode.
   * @returns {PortSession} The resolved port session for the client.
   */
  private _resolveSessionForClient(options: ICreateClientOptions): PortSession {
    if (options.transportId) {
      const session = this._registry.get(options.transportId);
      if (!session) throw new Error(`Transport "${options.transportId}" not found`);
      return session;
    }

    const requiredRSMode = options.RSMode ?? 'RS485';
    const routed = this._router.select(options.slaveId, requiredRSMode);
    if (routed) return routed;

    // Creating a client before the port is connected is legitimate: fall back to any
    // registered port with a matching RS mode (the router only returns ready ports).
    const candidate = this._registry.getAll().find(session => session.rsMode === requiredRSMode);
    if (!candidate) {
      throw new ModbusNotConnectedError();
    }
    return candidate;
  }

  // ==================== Connection Management ====================

  /**
   * Connects all registered transports, initiating their connection process.
   * @returns {Promise<void>} A promise that resolves when all transports have been connected.
   */
  public async connectAll(): Promise<void> {
    await Promise.all(this._registry.getAll().map(session => this.connectTransport(session.id)));
  }

  /**
   * Disconnects all registered transports, stopping their connection and polling tasks.
   * @returns {Promise<void>} A promise that resolves when all transports have been disconnected.
   */
  public async disconnectAll(): Promise<void> {
    await Promise.all(this._registry.getAll().map(session => this.disconnectTransport(session.id)));
  }

  /**
   * Connects a specific transport.
   * @param {string} id - Transport identifier.
   * @returns {Promise<void>} A promise that resolves when the transport has been connected.
   */
  public async connectTransport(id: string): Promise<void> {
    const session = this._registry.get(id);
    if (!session || session.status === 'connected' || session.status === 'connecting') return;

    session.status = 'connecting';
    try {
      await session.transport.connect();
      session.reconnectAttempts = 0;
      if (!session.transport.isOpen) {
        const err = new ModbusNotConnectedError(
          `Transport "${id}" connect() resolved without opening the port: ` +
            'the port is unavailable (device not connected, driver missing, or port name wrong)'
        );
        session.status = 'error';
        session.lastError = err;
        this.logger.error({ transportId: id, err: err.message }, 'Failed to connect');
        throw err;
      }
      session.status = 'connected';
      this._pollingProxy.resumeAllForTransport(id);
      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      session.status = 'error';
      session.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ transportId: id, err: session.lastError.message }, 'Failed to connect');
      throw err;
    }
  }

  /**
   * Disconnects a specific transport and stops its polling tasks.
   * @param {string} id - Transport identifier.
   * @returns {Promise<void>} A promise that resolves when the transport has been disconnected.
   */
  public async disconnectTransport(id: string): Promise<void> {
    const session = this._registry.get(id);
    if (!session) return;

    // Stop polling tasks immediately (pause synchronously, without waiting for the exchange to complete) and
    // save their state: they will resume automatically upon reconnection.
    this._pollingProxy.pauseAllForTransport(id);

    // Do not keep items in the queue that will no longer be sent to the line: the port is closing now.
    session.queue.dropPending(new ModbusNotConnectedError(`Transport "${id}" is disconnecting`));

    await session.transport.disconnect();
    session.status = 'disconnected';
    this.logger.info(`Transport "${id}" disconnected`);
  }

  // ==================== Routing ====================

  /**
   * Finds an appropriate transport instance for a specific Slave ID and RS mode.
   * @param {number} slaveId - The Modbus slave ID.
   * @param {TRSMode} requiredRSMode - The required communication mode.
   * @returns {ITransport | null} The transport instance if found, otherwise null.
   */
  public getTransportForSlave(slaveId: number, requiredRSMode: TRSMode): ITransport | null {
    return this.getSessionForSlave(slaveId, requiredRSMode)?.transport ?? null;
  }

  /**
   * Resolves the port session (transport + shared queue) for a slave and RS mode.
   * Clients enqueue their exchanges on the session queue returned here.
   * @param {number} slaveId - The Modbus slave ID.
   * @param {TRSMode} requiredRSMode - The required communication mode.
   * @returns {PortSession | null} The port session if found, otherwise null.
   */
  public getSessionForSlave(slaveId: number, requiredRSMode: TRSMode): PortSession | null {
    return this._router.select(slaveId, requiredRSMode);
  }

  /**
   * Assigns a Slave ID to a transport.
   * Checks for RS232 limitations (max 1 device).
   * @param {string} transportId - The transport identifier.
   * @param {number} slaveId - The Slave ID to assign.
   * @throws {RSModeConstraintError} If the transport is RS232 and already has a device assigned.
   */
  public async assignSlaveIdToTransport(transportId: string, slaveId: number): Promise<void> {
    await this._mutex.runExclusive(() => {
      const session = this._registry.get(transportId);
      if (!session) throw new Error(`Transport "${transportId}" not found`);

      if (session.rsMode === 'RS232' && session.slaveIds.length >= 1) {
        throw new RSModeConstraintError(
          `Transport "${transportId}" is RS232 and already has device ${session.slaveIds[0]}`
        );
      }

      this._registry.assignSlave(transportId, slaveId);
      this.logger.info(`Assigned slave ${slaveId} to transport "${transportId}"`);
    });
  }

  /**
   * Removes a Slave ID from a transport.
   * @param transportId - The transport identifier.
   * @param slaveId - The Slave ID to remove.
   * @returns {Promise<void>} A promise that resolves when the Slave ID has been removed.
   */
  public async removeSlaveIdFromTransport(transportId: string, slaveId: number): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const session = this._registry.get(transportId);
      if (!session) return;

      this._registry.unassignSlave(transportId, slaveId);
      this._stateManager.removeDeviceState(slaveId, transportId);

      const transportAny = session.transport as any;
      if (typeof transportAny.removeConnectedDevice === 'function') {
        transportAny.removeConnectedDevice(slaveId);
      }

      this.logger.info(`Removed slave ${slaveId} from transport "${transportId}"`);

      if (session.slaveIds.length === 0) {
        this.logger.info(`Transport "${transportId}" is empty. Auto-removing...`);
        await this._removeTransportInternal(transportId);
      }
    });
  }

  /**
   * Wires the transport's device and port state handlers to the controller's internal methods.
   * @param session - The PortSession containing the transport to wire.
   * @returns {void}
   * @private
   */
  private _wireTransportHandlers(session: PortSession): void {
    const { transport, id } = session;

    transport.setDeviceStateHandler((slaveId: number, connected: boolean, error: any) => {
      this._onDeviceStateChange(id, slaveId, connected, error);
    });

    transport.setPortStateHandler((connected: boolean, slaveIds: number[], error: any) => {
      this._onPortStateChange(id, connected, slaveIds, error);
    });
  }

  // ==================== Hot Reload ====================

  /**
   * Reloads a transport with new options, preserving its session and clients.
   * The transport is disconnected, replaced, and reconnected if it was previously connected.
   * @param {string} id - The transport identifier to reload.
   * @param {object} options - New connection parameters for the transport.
   * @returns {Promise<void>} A promise that resolves when the transport has been reloaded.
   * @throws {Error} If the transport ID does not exist.
   */
  public async reloadTransport(
    id: string,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort })
  ): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const session = this._registry.get(id);
      if (!session) throw new Error(`Transport with id "${id}" not found`);

      const wasConnected = session.status === 'connected';

      // Freeze the port while the line is swapped: no exchange may start mid-reload.
      session.pause();
      session.pollingManager.clearAll();

      session.transport.setDeviceStateHandler(() => {});
      session.transport.setPortStateHandler(() => {});

      await this._disconnectTransportInternal(id);

      const newTransport = await TransportFactory.create(
        session.type as TTransportType,
        options,
        this.logger
      );

      // The session keeps its queue, polling manager and clients; the new transport is
      // installed and its state handlers are rewired.
      await session.reload(newTransport);

      this._stateManager.createDeviceTrackerForTransport(id);

      if (wasConnected) {
        session.status = 'connecting';
        try {
          await session.transport.connect();
          session.reconnectAttempts = 0;
          if (!session.transport.isOpen) {
            throw new ModbusNotConnectedError(
              `Transport "${id}" connect() resolved without opening the port during reload`
            );
          }
          session.status = 'connected';
          session.pollingManager.resumeAllTasks();
        } catch (err) {
          session.status = 'error';
          session.lastError = err instanceof Error ? err : new Error(String(err));
          this.logger.error({ transportId: id }, 'Failed to reconnect after reload');
        }
      }

      session.resume();

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
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);

    if (!session.transport.isOpen) {
      throw new Error(`Transport "${transportId}" is not open.`);
    }

    return session.pollingManager.executeImmediate(async () => {
      await session.transport.write(data);

      if (readLength > 0) {
        return session.transport.read(readLength, timeout);
      }

      await session.transport.flush();
      return utils.allocUint8Array(0);
    });
  }

  // ==================== State Handlers ====================

  /**
   * Sets a global handler for device state changes (connected/disconnected).
   * @param handler - The function to handle device state changes.
   * @returns {void}
   */
  public setDeviceStateHandler(handler: TDeviceStateHandler): void {
    this._stateManager.setDeviceHandler(handler);
  }

  /**
   * Sets a global handler for port state changes (connected/disconnected).
   * @param handler - The function to handle port state changes.
   * @returns {void}
   */
  public setPortStateHandler(handler: TPortStateHandler): void {
    this._stateManager.setPortHandler(handler);
  }

  /**
   * Sets a device state handler for a specific transport only.
   * @param transportId - The transport identifier for which to set the handler.
   * @param handler - The function to handle device state changes for the specified transport.
   * @returns {Promise<void>} A promise that resolves when the handler has been set.
   */
  public async setDeviceStateHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void> {
    await this._stateManager.setDeviceHandlerForTransport(transportId, handler);
  }

  /**
   * Sets a port state handler for a specific transport only.
   * @param transportId - The transport identifier for which to set the handler.
   * @param handler - The function to handle port state changes for the specified transport.
   * @returns {Promise<void>} A promise that resolves when the handler has been set.
   */
  public async setPortStateHandlerForTransport(
    transportId: string,
    handler: TPortStateHandler
  ): Promise<void> {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    await this._stateManager.setPortTrackerHandler(session.portTracker, handler);
  }

  // ==================== Polling Proxy ====================

  /**
   * Adds a new polling task to the specified transport's polling manager.
   * @param transportId - The identifier of the transport to which the polling task will be added.
   * @param options - The configuration options for the polling task, including the function to execute, interval, and other settings.
   * @returns {void}
   */
  public addPollingTask(transportId: string, options: IPollingTaskOptions): void {
    this._pollingProxy.addTask(transportId, options);
  }

  /**
   * Removes a polling task from the specified transport's polling manager.
   * @param transportId - The identifier of the transport from which the polling task will be removed.
   * @param taskId - The unique identifier of the polling task to remove.
   * @returns {void}
   */
  public removePollingTask(transportId: string, taskId: string): void {
    this._pollingProxy.removeTask(transportId, taskId);
  }

  /**
   * Updates the configuration of an existing polling task for a specific transport.
   * @param transportId - The identifier of the transport whose polling task will be updated.
   * @param taskId - The unique identifier of the polling task to update.
   * @param options - Partial configuration options to update the polling task with. Only the provided fields will be updated.
   * @returns {Promise<void>} A promise that resolves when the polling task has been updated.
   * @throws {Error} If the transport or task does not exist.
   */
  public async updatePollingTask(
    transportId: string,
    taskId: string,
    options: Partial<IPollingTaskOptions>
  ): Promise<void> {
    await this._pollingProxy.updateTask(transportId, taskId, options as IPollingTaskOptions);
  }

  /**
   * Controls a specific polling task for a transport, allowing actions such as pause, resume, or stop.
   * @param transportId - The identifier of the transport whose polling task will be controlled.
   * @param taskId - The unique identifier of the polling task to control.
   * @param action - The action to perform on the polling task (e.g., pause, resume, stop).
   * @returns {void}
   */
  public controlTask(transportId: string, taskId: string, action: TPollingAction): void {
    this._pollingProxy.controlTask(transportId, taskId, action);
  }

  /**
   * Controls all polling tasks for a specific transport, allowing actions such as pause, resume, or stop.
   * @param transportId - The identifier of the transport whose polling tasks will be controlled.
   * @param action - The action to perform on all polling tasks (e.g., pause, resume, stop).
   * @returns {void}
   */
  public controlPolling(transportId: string, action: TPollingBulkAction): void {
    this._pollingProxy.controlAll(transportId, action);
  }

  /**
   * Retrieves information about the polling queue for a specific transport, including the number of tasks and their statuses.
   * @param transportId - The identifier of the transport whose polling queue information will be retrieved.
   * @returns {IPollingQueueInfo} An object containing information about the polling queue, such as the number of tasks, their statuses, and other relevant details.
   * @throws {Error} If the transport does not exist.
   */
  public getPollingQueueInfo(transportId: string): IPollingQueueInfo {
    return this._pollingProxy.getQueueInfo(transportId);
  }

  /**
   * Executes a function immediately on the specified transport, bypassing the polling queue.
   * @param transportId - The identifier of the transport on which to execute the function.
   * @param fn - The asynchronous function to execute immediately. It should return a promise that resolves with the desired result.
   * @returns {Promise<T>} A promise that resolves with the result of the executed function.
   * @template T - The type of the result returned by the executed function.
   * @throws {Error} If the transport does not exist or if the function execution fails.
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    return this._pollingProxy.executeImmediate(transportId, fn);
  }

  // ==================== Status ====================

  /**
   * Retrieves the status of a specific transport or all transports if no ID is provided.
   * @param id - Optional transport identifier. If provided, returns the status of that specific transport; otherwise, returns the status of all transports.
   * @returns {ITransportStatus | Record<string, ITransportStatus>} The status of the specified transport or a record of all transport statuses.
   */
  public getStatus(id?: string): ITransportStatus | Record<string, ITransportStatus> {
    if (id) {
      const session = this._registry.get(id);
      return session ? this._buildStatus(session) : ({} as ITransportStatus);
    }

    const result: Record<string, ITransportStatus> = {};
    for (const session of this._registry.getAll()) {
      result[session.id] = this._buildStatus(session);
    }
    return result;
  }

  /**
   * Returns the count of currently active (connected) transports.
   * @returns {number} The number of active transports.
   */
  public getActiveTransportCount(): number {
    return this._registry.getAll().filter(i => i.status === 'connected').length;
  }

  /**
   * Builds a transport status object from a given PortSession.
   * @param session - The PortSession instance from which to build the status.
   * @returns {ITransportStatus} The transport status object containing relevant information about the session.
   */
  private _buildStatus(session: PortSession): ITransportStatus {
    const tasksRunning = Array.from(session.pollingManager.tasks.values()).filter(task =>
      task.isRunning()
    ).length;

    return {
      id: session.id,
      connected: session.status === 'connected',
      lastError: session.lastError,
      connectedSlaveIds: [...session.slaveIds],
      uptime: Date.now() - session.createdAt.getTime(),
      reconnectAttempts: session.reconnectAttempts,
      pollingStats: {
        queueLength: session.queue.getStats().queueLength,
        tasksRunning,
        clientsCount: session.clients.size,
      },
    };
  }

  // ==================== Lifecycle ====================

  /**
   * Destroys the TransportController, disconnecting all transports, removing all clients, and clearing internal registries.
   * This method should be called when the controller is no longer needed to free up resources.
   * @returns {Promise<void>} A promise that resolves when the controller has been destroyed.
   */
  public async destroy(): Promise<void> {
    await this._mutex.runExclusive(async () => {
      for (const session of this._registry.getAll()) {
        await this._removeClientsOfSession(session.id);
      }

      for (const session of this._registry.getAll()) {
        await session.destroy();
        await this._stateManager.clearTransport(session.id);
      }

      this._registry.clearAll();
      this._clientRegistry.clear();

      this.logger.info('TransportController destroyed');
    });
  }

  // ==================== Internal Methods ====================

  /**
   * Disconnects a transport internally, pausing its polling tasks and updating its status.
   * @param id - The identifier of the transport to disconnect.
   * @returns {Promise<void>} A promise that resolves when the transport has been disconnected.
   * @private
   */
  private async _disconnectTransportInternal(id: string): Promise<void> {
    const session = this._registry.get(id);
    if (!session) return;

    try {
      this._pollingProxy.pauseAllForTransport(id);
      await session.transport.disconnect();
      session.status = 'disconnected';
    } catch {
      this.logger.error({ transportId: id }, 'Error disconnecting transport');
    }
  }

  /**
   * Removes a transport internally, cleaning up its clients, device state, and registry entries.
   * @param id - The identifier of the transport to remove.
   * @returns {Promise<void>} A promise that resolves when the transport has been fully removed.
   * @private
   */
  private async _removeTransportInternal(id: string): Promise<void> {
    const session = this._registry.get(id);
    if (!session) return;

    await this._removeClientsOfSession(id);

    await session.destroy();

    this._registry.clearSlaveAssignments(id);

    const transportAny = session.transport as any;
    if (typeof transportAny.removeConnectedDevice === 'function') {
      for (const sid of session.slaveIds) {
        transportAny.removeConnectedDevice(sid);
      }
    }

    await this._stateManager.clearTransport(id);
    await this._registry.remove(id);

    this.logger.info(`Transport "${id}" fully removed`);
  }

  /**
   * Internal handler for device state changes received from ITransport.
   * @param transportId - The identifier of the transport for which the state change occurred.
   * @param slaveId - The identifier of the slave device for which the state change occurred.
   * @param connected - A boolean indicating whether the device is connected.
   * @param error - An optional error object containing details about the connection error.
   * @returns {Promise<void>} A promise that resolves when the state change has been processed.
   * @private
   */
  private async _onDeviceStateChange(
    transportId: string,
    slaveId: number,
    connected: boolean,
    error?: { type: EConnectionErrorType; message: string }
  ): Promise<void> {
    const session = this._registry.get(transportId);
    if (!session) return;

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

  /**
   * Internal handler for port state changes received from ITransport.
   * @param transportId - The identifier of the transport for which the state change occurred.
   * @param connected - A boolean indicating whether the port is connected.
   * @param slaveIds - An array of identifiers for the slave devices associated with the port.
   * @param error - An optional error object containing details about the connection error.
   * @returns {Promise<void>} A promise that resolves when the state change has been processed.
   * @private
   */
  private async _onPortStateChange(
    transportId: string,
    connected: boolean,
    slaveIds: number[],
    error?: { type: EConnectionErrorType; message: string }
  ): Promise<void> {
    const session = this._registry.get(transportId);
    if (!session) return;

    if (connected) {
      await this._stateManager.notifyPortConnected(session.portTracker, session.slaveIds);
      this._pollingProxy.resumeAllForTransport(transportId);
      session.status = 'connected';
    } else {
      const errorType = error?.type ?? ({} as EConnectionErrorType);
      const errorMessage = error?.message ?? 'Port disconnected';
      this._pollingProxy.pauseAllForTransport(transportId);
      session.status = 'disconnected';
      await this._stateManager.notifyPortDisconnected(
        session.portTracker,
        session.slaveIds,
        errorType as EConnectionErrorType,
        errorMessage
      );
      if (error) {
        session.lastError = new Error(error.message);
      }
    }
  }
}

export = TransportController;
