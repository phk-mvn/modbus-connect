"use strict";
// modbus/transport/transport-controller.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const pino_1 = require("pino");
const utils = __importStar(require("../utils/utils.js"));
const polling_manager_js_1 = __importDefault(require("../polling-manager.js"));
const async_mutex_1 = require("async-mutex");
const transport_factory_js_1 = require("./modules/transport-factory.js");
const scanners_js_1 = require("../utils/scanners.js");
const modbus_types_js_1 = require("../types/modbus-types.js");
const DeviceConnectionTracker_js_1 = require("./trackers/DeviceConnectionTracker.js");
const PortConnectionTracker_js_1 = require("./trackers/PortConnectionTracker.js");
const errors_js_1 = require("../errors.js");
/**
 * TransportController.
 * The central hub managing the lifecycle of all transport connections (Node/Web Serial, TCP).
 * It handles request routing to devices (Slave IDs), load balancing across multiple channels,
 * connection state tracking, and provides a proxy interface for polling management.
 */
class TransportController {
    scanner;
    _activeScanCtrl = null;
    /** Internal registry of all added transports */
    transports = new Map();
    /** Routing map: SlaveID -> Array of Transport IDs capable of reaching it */
    slaveTransportMap = new Map();
    /** Current load balancing strategy for selecting a transport when multiple are available */
    loadBalancerStrategy = 'first-available';
    /** Winston logger instance for controller-level logging */
    logger;
    /**
     * Mutex to protect the transport registry from race conditions.
     * Locks add/remove/reload/destroy operations to ensure atomicity.
     */
    _registryMutex = new async_mutex_1.Mutex();
    // Load balancer internal state
    _roundRobinIndex = 0;
    _stickyMap = new Map();
    // Tracking and callback maps
    transportToDeviceTrackerMap = new Map();
    transportToPortTrackerMap = new Map();
    transportToDeviceHandlerMap = new Map();
    transportToPortHandlerMap = new Map();
    // Global external handlers
    _externalDeviceStateHandler = null;
    _externalPortStateHandler = null;
    /**
     * Initializes the TransportController with a custom formatted logger.
     */
    constructor() {
        this.logger = (0, pino_1.pino)({
            level: 'info',
            base: { component: 'Transport Controller' },
            transport: process.env.NODE_ENV !== 'production'
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
        this.logger.debug('Transport Controller initialized');
        this.scanner = new scanners_js_1.ModbusScanner(this.logger);
    }
    /**
     * Disables all logging output.
     * Re-initializes the pino instance with the 'silent' level to stop any log emission.
     */
    disableLogger() {
        this.logger = (0, pino_1.pino)({
            level: 'silent',
        });
    }
    /**
     * Enables and configures the logger.
     *
     * Sets the default log level to 'info' and attaches metadata (component name and slave ID).
     * If the environment is not 'production', it enables `pino-pretty` transport
     * with custom message formatting for better developer experience.
     */
    enableLogger() {
        this.logger = (0, pino_1.pino)({
            level: 'info',
            base: { component: 'Transport Controller' },
            transport: process.env.NODE_ENV !== 'production'
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
    /**
     * Sets a global handler for device connection state changes.
     * Triggered when any device on any transport changes its connection status.
     * @param handler - The callback function.
     */
    setDeviceStateHandler(handler) {
        this._externalDeviceStateHandler = handler;
    }
    /**
     * Sets a global handler for port/transport connection state changes.
     * Triggered when any physical transport connects or disconnects.
     * @param handler - The callback function.
     */
    setPortStateHandler(handler) {
        this._externalPortStateHandler = handler;
    }
    /**
     * Pauses the currently active scanning process.
     */
    pauseScan() {
        this._activeScanCtrl?.pause();
    }
    /**
     * Resumes the currently active scanning process.
     */
    resumeScan() {
        this._activeScanCtrl?.resume();
    }
    /**
     * Stops the currently active scanning process and clears state.
     */
    stopScan() {
        this._activeScanCtrl?.stop();
    }
    /**
     * Scans an RTU line for Modbus devices.
     * Automatically detects the environment (Node.js or Web Serial) based on the path type,
     * or uses the explicitly provided 'type' in options.
     *
     * @param options - Scanning configurations (path, IDs, bauds, etc.).
     * @returns A promise resolving to a list of discovered RTU devices.
     */
    async scanRtuPort(options) {
        let transportType = 'node-rtu';
        if (options.type) {
            transportType = options.type;
        }
        else if (options.path && typeof options.path !== 'string') {
            transportType = 'web-rtu';
        }
        this._activeScanCtrl = options.controller || new scanners_js_1.ScanController();
        try {
            this.logger.info(`Starting RTU scan using ${transportType} transport`);
            return await this.scanner.scanRtu(options, transportType, this._activeScanCtrl);
        }
        finally {
            this._activeScanCtrl = null;
        }
    }
    /**
     * Initiates an auto-discovery scan for Modbus TCP devices on the network.
     * @param options - Scanning configurations (hosts, ports, unit IDs).
     * @returns A promise resolving to a list of discovered TCP devices.
     */
    async scanTcpPort(options) {
        this._activeScanCtrl = options.controller || new scanners_js_1.ScanController();
        try {
            return await this.scanner.scanTcp(options, this._activeScanCtrl);
        }
        finally {
            this._activeScanCtrl = null;
        }
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
    async addTransport(id, type, options, reconnectOptions, pollingConfig) {
        await this._registryMutex.runExclusive(async () => {
            if (this.transports.has(id)) {
                throw new Error(`Transport with id "${id}" already exists`);
            }
            const rsMode = options.RSMode;
            const slaveIds = options.slaveIds || [];
            if (rsMode === 'RS232' && slaveIds.length > 1) {
                throw new errors_js_1.RSModeConstraintError(`Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device. Provided ${slaveIds.length} devices.`);
            }
            const transport = await transport_factory_js_1.TransportFactory.create(type, options, this.logger);
            const seenSlaveIds = new Set();
            for (const slaveId of slaveIds) {
                if (seenSlaveIds.has(slaveId)) {
                    throw new Error(`Duplicate slave ID ${slaveId} provided for transport "${id}". Each slave ID must be unique per transport.`);
                }
                seenSlaveIds.add(slaveId);
            }
            const fallbacks = options.fallbacks || [];
            const pollingManager = new polling_manager_js_1.default(pollingConfig);
            const info = {
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
            const deviceTracker = new DeviceConnectionTracker_js_1.DeviceConnectionTracker();
            const portTracker = new PortConnectionTracker_js_1.PortConnectionTracker();
            this.transportToDeviceTrackerMap.set(id, deviceTracker);
            this.transportToPortTrackerMap.set(id, portTracker);
            transport.setDeviceStateHandler((slaveId, connected, error) => {
                this._onDeviceStateChange(id, slaveId, connected, error);
            });
            transport.setPortStateHandler((connected, slaveIds, error) => {
                this._onPortStateChange(id, connected, slaveIds, error);
            });
            this._updateSlaveTransportMap(id, slaveIds);
            this.logger.info(`Transport "${id}" added with PollingManager`);
        });
    }
    /**
     * Removes a transport, stops all its polling tasks, and closes the connection.
     * @param id - The ID of the transport to remove.
     */
    async removeTransport(id) {
        await this._registryMutex.runExclusive(async () => {
            await this._removeTransportInternal(id);
        });
    }
    // =========================================================
    // Polling Manager Proxy Methods
    // =========================================================
    /**
     * Helper to retrieve transport info or throw if missing.
     */
    _getTransportInfo(transportId) {
        const info = this.transports.get(transportId);
        if (!info)
            throw new Error(`Transport "${transportId}" not found`);
        return info;
    }
    /**
     * Adds a polling task to the specified transport's manager.
     * @param transportId - Target transport ID.
     * @param options - Polling task parameters.
     */
    addPollingTask(transportId, options) {
        const info = this._getTransportInfo(transportId);
        info.pollingManager.addTask(options);
    }
    /**
     * Removes a specific polling task from a transport.
     * @param transportId - Target transport ID.
     * @param taskId - Task ID to remove.
     */
    removePollingTask(transportId, taskId) {
        const info = this._getTransportInfo(transportId);
        info.pollingManager.removeTask(taskId);
    }
    /**
     * Updates configuration for an existing polling task.
     * @param transportId - Target transport ID.
     * @param taskId - Task ID to update.
     * @param newOptions - New parameters.
     */
    updatePollingTask(transportId, taskId, newOptions) {
        const info = this._getTransportInfo(transportId);
        info.pollingManager.updateTask(taskId, newOptions);
    }
    /**
     * Controls the state of a specific task (start/stop/pause/resume).
     * @param transportId - Target transport ID.
     * @param taskId - Task ID.
     * @param action - Action to perform.
     */
    controlTask(transportId, taskId, action) {
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
    controlPolling(transportId, action) {
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
    getPollingQueueInfo(transportId) {
        const info = this._getTransportInfo(transportId);
        return info.pollingManager.getQueueInfo();
    }
    /**
     * Executes a function (e.g., Modbus Write) using the PollingManager's mutex.
     * This ensures the operation is atomic and doesn't collide with background polling.
     * @param transportId - Target transport ID.
     * @param fn - Async function to execute.
     */
    async executeImmediate(transportId, fn) {
        const info = this._getTransportInfo(transportId);
        return info.pollingManager.executeImmediate(fn);
    }
    /**
     * Returns the transport instance for a given ID.
     * @param id - Transport ID.
     */
    getTransport(id) {
        const info = this.transports.get(id);
        return info ? info.transport : null;
    }
    /**
     * Returns a list of all registered transports and their metadata.
     */
    listTransports() {
        return Array.from(this.transports.values());
    }
    /**
     * Initiates connection for all registered transports.
     */
    async connectAll() {
        const promises = Array.from(this.transports.values()).map(info => this.connectTransport(info.id));
        await Promise.all(promises);
    }
    /**
     * Disconnects all registered transports.
     */
    async disconnectAll() {
        const promises = Array.from(this.transports.values()).map(info => this.disconnectTransport(info.id));
        await Promise.all(promises);
    }
    /**
     * Connects a specific transport.
     * Resumes polling upon successful connection.
     * @param id - Transport ID.
     */
    async connectTransport(id) {
        const info = this.transports.get(id);
        if (!info)
            throw new Error(`Transport with id "${id}" not found`);
        if (info.status === 'connecting' || info.status === 'connected')
            return;
        info.status = 'connecting';
        try {
            await info.transport.connect();
            info.status = 'connected';
            info.reconnectAttempts = 0;
            info.pollingManager.resumeAllTasks();
            this.logger.info(`Transport "${id}" connected`);
        }
        catch (err) {
            info.status = 'error';
            info.lastError = err instanceof Error ? err : new Error(String(err));
            this.logger.error({ transportId: id, err: info.lastError.message }, 'Failed to connect transport');
            // Internal auto-reconnect logic
            // if (info.reconnectAttempts < info.maxReconnectAttempts) {
            //   info.reconnectAttempts++;
            //   setTimeout(
            //     () => this.connectTransport(id),
            //     info.reconnectInterval * info.reconnectAttempts
            //   );
            // } else {
            //   this.logger.error(`Max reconnection attempts reached for "${id}"`);
            // }
            throw err;
        }
    }
    /**
     * Disconnects a specific transport.
     * @param id - Transport ID.
     */
    async disconnectTransport(id) {
        await this._disconnectTransportInternal(id);
    }
    /**
     * Internal disconnect implementation.
     * Pauses polling and closes the transport without checking registry mutex.
     */
    async _disconnectTransportInternal(id) {
        const info = this.transports.get(id);
        if (!info)
            return;
        try {
            info.pollingManager.pauseAllTasks();
            await info.transport.disconnect();
            info.status = 'disconnected';
            this.logger.info(`Transport "${id}" disconnected`);
        }
        catch (err) {
            this.logger.error({ transportId: id, err: err.message }, 'Error disconnecting transport');
        }
    }
    /**
     * Binds a new Slave ID to an existing transport.
     * Updates routing so requests for this slave are directed to this transport.
     * @param transportId - Target transport.
     * @param slaveId - Modbus unit identifier.
     * @throws RSModeConstraintError if RS232 already has a device.
     */
    async assignSlaveIdToTransport(transportId, slaveId) {
        await this._registryMutex.runExclusive(async () => {
            const info = this.transports.get(transportId);
            if (!info) {
                throw new Error(`Transport with id "${transportId}" not found`);
            }
            if (info.rsMode === 'RS232' && info.slaveIds.length >= 1) {
                const existingSlaveId = info.slaveIds[0];
                throw new errors_js_1.RSModeConstraintError(`Cannot assign slaveId ${slaveId} to transport "${transportId}". It is in 'RS232' mode and already manages device ${existingSlaveId}.`);
            }
            if (info.slaveIds.includes(slaveId)) {
                this.logger.warn(`Slave ID ${slaveId} is already assigned to transport "${transportId}"`);
                return;
            }
            info.slaveIds.push(slaveId);
            this._updateSlaveTransportMap(transportId, [slaveId]);
            this.logger.info(`Assigned slaveId ${slaveId} to transport "${transportId}"`);
        });
    }
    /**
     * Unbinds a Slave ID from a transport and cleans up its state in trackers.
     * @param transportId - Transport ID.
     * @param slaveId - Modbus unit identifier.
     */
    async removeSlaveIdFromTransport(transportId, slaveId) {
        await this._registryMutex.runExclusive(async () => {
            const info = this.transports.get(transportId);
            if (!info) {
                this.logger.warn(`Attempted to remove slaveId ${slaveId} from non-existent transport "${transportId}"`);
                return;
            }
            const index = info.slaveIds.indexOf(slaveId);
            if (index !== -1) {
                info.slaveIds.splice(index, 1);
            }
            else {
                return;
            }
            const transportList = this.slaveTransportMap.get(slaveId);
            if (transportList) {
                const updatedList = transportList.filter(tid => tid !== transportId);
                if (updatedList.length === 0) {
                    this.slaveTransportMap.delete(slaveId);
                }
                else {
                    this.slaveTransportMap.set(slaveId, updatedList);
                }
            }
            if (this._stickyMap.get(slaveId) === transportId) {
                this._stickyMap.delete(slaveId);
            }
            const tracker = this.transportToDeviceTrackerMap.get(transportId);
            if (tracker) {
                tracker.removeState(slaveId);
            }
            const transportAny = info.transport;
            if (typeof transportAny.removeConnectedDevice === 'function') {
                transportAny.removeConnectedDevice(slaveId);
            }
            this.logger.info(`Removed slaveId ${slaveId} from transport "${transportId}"`);
            if (info.slaveIds.length === 0) {
                this.logger.info(`Transport "${transportId}" is empty. Auto-removing...`);
                await this._removeTransportInternal(transportId);
            }
        });
    }
    /**
     * Hot-reloads a transport with new configuration options.
     * Useful for changing Baud Rate or Host without restarting the application.
     * @param id - Transport ID.
     * @param options - New options.
     */
    async reloadTransport(id, options) {
        await this._registryMutex.runExclusive(async () => {
            const info = this.transports.get(id);
            if (!info)
                throw new Error(`Transport with id "${id}" not found`);
            const wasConnected = info.status === 'connected';
            info.pollingManager.clearAll();
            info.transport.setDeviceStateHandler(() => { });
            info.transport.setPortStateHandler(() => { });
            await this._disconnectTransportInternal(id);
            const newTransport = await transport_factory_js_1.TransportFactory.create(info.type, options, this.logger);
            const deviceTracker = new DeviceConnectionTracker_js_1.DeviceConnectionTracker();
            const portTracker = new PortConnectionTracker_js_1.PortConnectionTracker();
            this.transportToDeviceTrackerMap.set(id, deviceTracker);
            this.transportToPortTrackerMap.set(id, portTracker);
            newTransport.setDeviceStateHandler((slaveId, connected, error) => {
                this._onDeviceStateChange(id, slaveId, connected, error);
            });
            newTransport.setPortStateHandler((connected, slaveIds, error) => {
                this._onPortStateChange(id, connected, slaveIds, error);
            });
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
                info.status = 'connecting';
                try {
                    await info.transport.connect();
                    info.status = 'connected';
                    info.reconnectAttempts = 0;
                    info.pollingManager.resumeAllTasks();
                }
                catch (err) {
                    info.status = 'error';
                    info.lastError = err instanceof Error ? err : new Error(String(err));
                    this.logger.error({ transportId: id, err: err.message }, 'Failed to reconnect after reload');
                }
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
    async writeToPort(transportId, data, readLength = 0, timeout = 3000) {
        const info = this._getTransportInfo(transportId);
        if (!info.transport.isOpen) {
            throw new Error(`Transport "${transportId}" is not open (connection status: ${info.status}).`);
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
    /**
     * Updates the internal SlaveID to Transport routing map.
     */
    _updateSlaveTransportMap(id, slaveIds) {
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
    getTransportForSlave(slaveId, requiredRSMode) {
        const transportIds = this.slaveTransportMap.get(slaveId);
        if (transportIds && transportIds.length > 0) {
            let transport = null;
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
        this.logger.warn(`No connected transport found for slave ${slaveId} with required RSMode ${requiredRSMode}`);
        return null;
    }
    /**
     * Strategy: Cycle through available transports for balanced load.
     */
    _getTransportRoundRobin(transportIds) {
        const connectedTransports = transportIds
            .map(id => this.transports.get(id))
            .filter((info) => !!info && info.status === 'connected');
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
    _getTransportSticky(slaveId, transportIds) {
        const lastUsedId = this._stickyMap.get(slaveId);
        if (lastUsedId) {
            const info = this.transports.get(lastUsedId);
            if (info && info.status === 'connected' && transportIds.includes(lastUsedId)) {
                return info.transport;
            }
        }
        const transport = this._getTransportFirstAvailable(transportIds);
        if (transport) {
            const transportEntry = Array.from(this.transports.entries()).find(([_id, info]) => info.transport === transport);
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
    _getTransportFirstAvailable(transportIds) {
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
    getStatus(id) {
        if (id) {
            const info = this.transports.get(id);
            if (!info)
                return {};
            return {
                id: info.id,
                connected: info.status === 'connected',
                lastError: info.lastError,
                connectedSlaveIds: info.slaveIds,
                uptime: Date.now() - info.createdAt.getTime(),
                reconnectAttempts: info.reconnectAttempts,
            };
        }
        const result = {};
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
    getActiveTransportCount() {
        let count = 0;
        for (const info of this.transports.values()) {
            if (info.status === 'connected')
                count++;
        }
        return count;
    }
    /**
     * Updates the global load balancing strategy.
     */
    setLoadBalancer(strategy) {
        this.loadBalancerStrategy = strategy;
    }
    /**
     * Attaches a device state handler to a specific transport tracker.
     */
    async setDeviceStateHandlerForTransport(transportId, handler) {
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
    async setPortStateHandlerForTransport(transportId, handler) {
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
    async _onDeviceStateChange(transportId, slaveId, connected, error) {
        await this._registryMutex.runExclusive(async () => {
            const info = this.transports.get(transportId);
            if (!info) {
                this.logger.debug(`[${transportId}] Device event ignored: transport removed from registry`);
                return;
            }
            const tracker = this.transportToDeviceTrackerMap.get(transportId);
            if (!tracker) {
                this.logger.warn(`No device tracker found for transport "${transportId}"`);
                return;
            }
            if (connected) {
                await tracker.notifyConnected(slaveId);
            }
            else {
                const errorType = error?.type || modbus_types_js_1.EConnectionErrorType.UnknownError;
                const errorMessage = error?.message || 'Device disconnected';
                tracker.notifyDisconnected(slaveId, errorType, errorMessage);
            }
        });
        const handler = this.transportToDeviceHandlerMap.get(transportId);
        if (handler) {
            try {
                handler(slaveId, connected, error);
            }
            catch (e) {
                this.logger.error({ e }, `Error in local device handler for transport ${transportId}:`);
            }
        }
        if (this._externalDeviceStateHandler) {
            try {
                this._externalDeviceStateHandler(slaveId, connected, error);
            }
            catch (e) {
                this.logger.error({ e }, `Error in external device state handler:`);
            }
        }
    }
    /**
     * Internal bridge for port/socket state events.
     * Updates trackers, pauses/resumes polling, and notifies global/local handlers.
     */
    async _onPortStateChange(transportId, connected, slaveIds, error) {
        await this._registryMutex.runExclusive(async () => {
            const info = this.transports.get(transportId);
            if (!info) {
                this.logger.debug(`[${transportId}] Port event ignored: transport no logger exists in registry`);
                return;
            }
            const tracker = this.transportToPortTrackerMap.get(transportId);
            if (!tracker)
                return;
            if (connected) {
                await tracker.notifyConnected();
                info.pollingManager.resumeAllTasks();
            }
            else {
                const errorType = error?.type || modbus_types_js_1.EConnectionErrorType.UnknownError;
                const errorMessage = error?.message || 'Port disconnected';
                tracker.notifyDisconnected(errorType, errorMessage, slaveIds);
                info.pollingManager.pauseAllTasks();
            }
            info.status = connected ? 'connected' : 'disconnected';
            if (!connected && error) {
                info.lastError = new Error(error?.message);
            }
        });
        const handler = this.transportToPortHandlerMap.get(transportId);
        if (handler) {
            try {
                handler(connected, slaveIds, error);
            }
            catch (e) {
                this.logger.error({ e }, `Error in local port state handler for ${transportId}:`);
            }
        }
        if (this._externalPortStateHandler) {
            try {
                this._externalPortStateHandler(connected, slaveIds, error);
            }
            catch (e) {
                this.logger.error({ e }, `Error in external port state handler`);
            }
        }
    }
    async _removeTransportInternal(id) {
        const info = this.transports.get(id);
        if (!info)
            return;
        info.transport.setDeviceStateHandler(() => { });
        info.transport.setPortStateHandler(() => { });
        info.pollingManager.clearAll();
        await this._disconnectTransportInternal(id);
        this.transports.delete(id);
        this.transportToDeviceTrackerMap.delete(id);
        this.transportToPortTrackerMap.delete(id);
        this.transportToDeviceHandlerMap.delete(id);
        this.transportToPortHandlerMap.delete(id);
        for (const [slaveId, list] of this.slaveTransportMap.entries()) {
            const updated = list.filter(tid => tid !== id);
            if (updated.length === 0) {
                this.slaveTransportMap.delete(slaveId);
            }
            else {
                this.slaveTransportMap.set(slaveId, updated);
            }
        }
        for (const [slaveId, tid] of this._stickyMap.entries()) {
            if (tid === id) {
                this._stickyMap.delete(slaveId);
            }
        }
        const transportAny = info.transport;
        if (typeof transportAny.removeConnectedDevice === 'function') {
            for (const sid of info.slaveIds) {
                transportAny.removeConnectedDevice(sid);
            }
        }
        this.logger.info(`Transport "${id}" fully removed and cleaned up`);
    }
    /**
     * Fully shuts down the controller.
     * Stops all polling, disconnects all transports, and clears memory.
     * Mutex-protected to prevent race conditions during shutdown.
     */
    async destroy() {
        await this._registryMutex.runExclusive(async () => {
            for (const info of this.transports.values()) {
                info.pollingManager.clearAll();
            }
            await Promise.all(Array.from(this.transports.values()).map(info => this._disconnectTransportInternal(info.id)));
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
module.exports = TransportController;
//# sourceMappingURL=transport-controller.js.map