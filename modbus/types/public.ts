// modbus/types/public.ts

/**
 * Public API types and interfaces for external consumers of modbus-connect.
 *
 * This module defines types for:
 * - Modbus client and custom plugins
 * - Transports (RTU, TCP, WebSerial, Emulators)
 * - Polling management and scheduler tasks
 * - Controller orchestrator and device/port state tracking
 * - Bus scanner and network diagnostics
 * - Port queuing and serialized sessions
 */

import { Logger, type ILogObj } from 'tslog';
import type ModbusClient from '../core/client.js';
import type PollingManager from '../polling/manager.js';
import type { PortConnectionTracker } from '../transport/trackers/port-tracker.js';
import type RegisterData from '../core/register-data.js';

// ===================================================
// MODBUS CLIENT
// ===================================================

/**
 * Core interface representing a high-level Modbus Client instance.
 * Provides standard Modbus function execution, custom plugin registration,
 * and per-client device state tracking.
 */
export interface IModbusClient {
  /**
   * Registers a custom plugin to extend client functionality with proprietary function codes.
   *
   * @param plugin - An instance of IModbusPlugin to register.
   * @returns void
   */
  use(plugin: IModbusPlugin): void;

  /**
   * Executes a custom function code registered via a plugin.
   *
   * @param functionName - Name of the custom function as registered in the plugin.
   * @param args - Arguments passed to the plugin request builder.
   * @returns A Promise resolving to the parsed result of the custom function response.
   */
  executeCustomFunction(functionName: string, ...args: any[]): Promise<any>;

  /**
   * Disables logging for this client instance (sets log level to 'silent').
   *
   * @returns void
   */
  disableLogger(): void;

  /**
   * Enables logging for this client instance (sets log level to 'info').
   *
   * @returns void
   */
  enableLogger(): void;

  /**
   * Connects the underlying transport associated with this client.
   *
   * @returns A Promise resolving when the connection has been established.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the underlying transport associated with this client.
   *
   * @returns A Promise resolving when the connection has been closed.
   */
  disconnect(): Promise<void>;

  /**
   * Reassigns this client to a new Modbus slave address.
   *
   * @param newSlaveId - New slave unit identifier (1-255).
   * @returns A Promise resolving once the slave ID has been updated in the controller.
   */
  setSlaveId(newSlaveId: number): Promise<void>;

  /**
   * Sends an arbitrary raw PDU (Protocol Data Unit) and returns the response PDU.
   * Useful for vendor-specific function codes, testing, and debugging.
   *
   * @param pdu - Raw PDU bytes to transmit (function code followed by payload).
   * @param timeout - Optional per-attempt timeout in milliseconds.
   * @returns A Promise resolving to the raw response PDU bytes.
   */
  rawExchange(pdu: Uint8Array, timeout?: number): Promise<Uint8Array>;

  /**
   * Registers a callback handler for this client's isolated device connection state.
   *
   * @param handler - Callback receiving (slaveId, connected, errorInfo).
   * @returns A Promise resolving once the handler is registered.
   */
  setDeviceStateHandler(handler: TDeviceStateHandler): Promise<void>;

  /**
   * Reads holding registers (Function Code 0x03).
   *
   * @param startAddress - Starting register address (0-65535).
   * @param quantity - Number of 16-bit registers to read (1-125).
   * @returns A Promise resolving to a RegisterData helper wrapper containing register values.
   */
  readHoldingRegisters(startAddress: number, quantity: number): Promise<RegisterData>;

  /**
   * Reads input registers (Function Code 0x04).
   *
   * @param startAddress - Starting register address (0-65535).
   * @param quantity - Number of 16-bit registers to read (1-125).
   * @returns A Promise resolving to a RegisterData helper wrapper containing register values.
   */
  readInputRegisters(startAddress: number, quantity: number): Promise<RegisterData>;

  /**
   * Writes a single holding register (Function Code 0x06).
   *
   * @param address - Register address to write (0-65535).
   * @param value - 16-bit unsigned value to write (0-65535).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the echoed startAddress and value.
   */
  writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<{ startAddress: number; value: number }>;

  /**
   * Writes multiple contiguous holding registers (Function Code 0x10).
   *
   * @param address - Starting register address to write (0-65535).
   * @param values - Array of 16-bit unsigned values to write (1-123 items).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the startAddress and quantity written.
   */
  writeMultipleRegisters(
    address: number,
    values: number[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }>;

  /**
   * Reads multiple coils (Function Code 0x01).
   *
   * @param startAddress - Starting coil address (0-65535).
   * @param quantity - Number of coil bits to read (1-2000).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to an array of boolean coil values.
   */
  readCoils(startAddress: number, quantity: number, timeout?: number): Promise<boolean[]>;

  /**
   * Reads multiple discrete inputs (Function Code 0x02).
   *
   * @param startAddress - Starting input address (0-65535).
   * @param quantity - Number of discrete input bits to read (1-2000).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to an array of boolean input values.
   */
  readDiscreteInputs(startAddress: number, quantity: number, timeout?: number): Promise<boolean[]>;

  /**
   * Writes a single coil status (Function Code 0x05).
   *
   * @param address - Coil address to write (0-65535).
   * @param value - Boolean state (true for ON, false for OFF).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the echoed startAddress and value.
   */
  writeSingleCoil(
    address: number,
    value: boolean,
    timeout?: number
  ): Promise<{ startAddress: number; value: boolean }>;

  /**
   * Writes multiple contiguous coils (Function Code 0x0F).
   *
   * @param address - Starting coil address to write (0-65535).
   * @param values - Array of boolean coil states to write (1-1968 items).
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the startAddress and quantity written.
   */
  writeMultipleCoils(
    address: number,
    values: boolean[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }>;

  /**
   * Queries slave device identity and running state (Function Code 0x11 - Report Slave ID).
   *
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the slave ID, run status indicator, and device-specific bytes.
   */
  reportSlaveId(
    timeout?: number
  ): Promise<{ slaveId: number; isRunning: boolean; data: Uint8Array }>;

  /**
   * Reads device identification objects (Function Code 0x2B / MEI Type 0x0E).
   *
   * @param decoder - Text encoding format used to decode string objects ('windows-1251' | 'utf-8').
   * @param timeout - Optional attempt timeout in milliseconds.
   * @returns A Promise resolving to the parsed identification metadata and dictionary of object strings.
   */
  readDeviceIdentification(
    decoder: 'windows-1251' | 'utf-8',
    timeout?: number
  ): Promise<{
    functionCode: number;
    meiType: number;
    category: number;
    conformityLevel: number;
    moreFollows: number;
    nextObjectId: number;
    numberOfObjects: number;
    objects: Record<number, string>;
  }>;
}

/**
 * Configuration options for initializing a ModbusClient instance.
 */
export interface IModbusClientOptions {
  /**
   * Modbus protocol framing mode ('rtu' or 'tcp').
   * Note: In managed clients, this is automatically derived from the port's RSMode.
   */
  framing?: TModbusProtocolType;

  /**
   * Physical transmission standard ('RS485', 'RS232', or 'TCP/IP').
   */
  RSMode?: TRSMode;

  /**
   * Timeout budget of a single exchange attempt (ms), measured from the moment it goes on the wire (default: 3000).
   */
  timeout?: number;

  /**
   * Total budget for one entire call (ms), including retries and retry delays.
   * `0` (default) disables the global budget.
   * When exceeded, rejects with ModbusOperationTimeoutError.
   */
  totalTimeout?: number;

  /**
   * Maximum number of retry attempts before failing (default: 0).
   */
  retryCount?: number;

  /**
   * Delay in milliseconds between consecutive retry attempts (default: 100).
   */
  retryDelay?: number;

  /**
   * Whether to enable echo cancellation on half-duplex lines where TX is received back on RX (default: false).
   */
  echo?: boolean;

  /**
   * Logging verbosity level for the client logger.
   */
  logLevel?: TModbusClientLogLevel;

  /**
   * Array of custom plugin constructors to instantiate and register on client creation.
   */
  plugins?: TPluginConstructor[];
}

/**
 * Constructor type for instantiating custom Modbus plugins.
 */
export type TPluginConstructor = new (...args: any[]) => IModbusPlugin;

/**
 * Interface that custom Modbus plugins must implement to provide user-defined function codes.
 */
export interface IModbusPlugin {
  /**
   * Name of the plugin.
   */
  name: string;

  /**
   * Mapping of custom function names to their request builder and response parser definitions.
   */
  customFunctionCodes?: { [functionName: string]: ICustomFunctionHandler };
}

/**
 * Handler definition for building requests and parsing responses of a custom Modbus function code.
 */
export interface ICustomFunctionHandler {
  /**
   * Builds the raw request PDU bytes for the custom function.
   *
   * @param args - Arbitrary arguments passed from executeCustomFunction.
   * @returns Raw PDU Uint8Array to send.
   */
  buildRequest: (...args: any[]) => Uint8Array;

  /**
   * Parses the raw response PDU bytes returned by the slave.
   *
   * @param responsePdu - Raw response PDU bytes.
   * @returns Parsed domain result.
   */
  parseResponse: (responsePdu: Uint8Array) => any;
}

// ===================================================
// TRANSPORT
// ===================================================

/**
 * Supported transport driver types.
 */
export type TTransportType = 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator';

/**
 * Physical serial transmission standards and network modes.
 * - 'RS485': Multi-drop serial bus supporting multiple slaves.
 * - 'RS232': Point-to-point serial connection supporting strictly one slave.
 * - 'TCP/IP': Ethernet encapsulation for Modbus TCP.
 */
export type TRSMode = 'RS485' | 'RS232' | 'TCP/IP';

/**
 * Serial parity checking options.
 */
export type TParityType = 'none' | 'even' | 'mark' | 'odd' | 'space';

/**
 * Framing protocols for Modbus packet encapsulation.
 */
export type TModbusProtocolType = 'rtu' | 'tcp';

/**
 * Categorized error types for connection state tracking and event notifications.
 */
export enum EConnectionErrorType {
  UnknownError = 'Unknown Error',
  PortClosed = 'Port closed',
  Timeout = 'Timeout',
  CRCError = 'CRC Error',
  ConnectionLost = 'Connection Lost',
  DeviceOffline = 'Device Offline',
  MaxReconnect = 'Max reconnect',
  ManualDisconnect = 'Manual disconnect',
  Destroyed = 'Destroyed',
}

/**
 * Interface that all Modbus transport drivers must implement.
 * Provides raw I/O, connection lifecycle, and state notification hooks.
 */
export interface ITransport {
  /**
   * Indicates whether the physical port, socket, or virtual emulator is currently open.
   */
  readonly isOpen: boolean;

  /**
   * Opens the transport connection.
   *
   * @returns A Promise resolving when connection succeeds.
   */
  connect(): Promise<void>;

  /**
   * Closes the transport connection and releases resources.
   *
   * @returns A Promise resolving when disconnection is complete.
   */
  disconnect(): Promise<void>;

  /**
   * Writes raw bytes to the communication channel.
   *
   * @param buffer - Raw byte array to transmit.
   * @returns A Promise resolving when writing completes.
   */
  write(buffer: Uint8Array): Promise<void>;

  /**
   * Reads a specified number of bytes from the channel.
   *
   * @param length - Exact number of bytes to read.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A Promise resolving to the received byte array.
   */
  read(length: number, timeout?: number): Promise<Uint8Array>;

  /**
   * Flushes internal read buffers and clears pending data.
   *
   * @returns A Promise resolving when the buffer is cleared.
   */
  flush(): Promise<void>;

  /**
   * Returns the RS mode configured for this transport.
   *
   * @returns TRSMode value ('RS485', 'RS232', or 'TCP/IP').
   */
  getRSMode(): TRSMode;

  /**
   * Registers a callback handler for slave device connection state updates.
   *
   * @param handler - Callback receiving (slaveId, connected, errorInfo).
   * @returns void
   */
  setDeviceStateHandler(handler: TDeviceStateHandler): void;

  /**
   * Registers a callback handler for port connection state updates.
   *
   * @param handler - Callback receiving (connected, slaveIds, errorInfo).
   * @returns void
   */
  setPortStateHandler(handler: TPortStateHandler): void;

  /**
   * Disables tracking of connected slave devices.
   *
   * @returns A Promise resolving once device tracking is disabled.
   */
  disableDeviceTracking(): Promise<void>;

  /**
   * Enables tracking of connected slave devices.
   *
   * @param handler - Optional callback handler to register.
   * @returns A Promise resolving once device tracking is enabled.
   */
  enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void>;

  /**
   * Optional notification hook indicating a slave device is active.
   *
   * @param slaveId - Slave device address.
   * @returns void
   */
  notifyDeviceConnected?(slaveId: number): void;

  /**
   * Optional notification hook indicating a slave device has disconnected.
   *
   * @param slaveId - Slave device address.
   * @param errorType - Error classification.
   * @param errorMessage - Descriptive error message.
   * @returns void
   */
  notifyDeviceDisconnected?(
    slaveId: number,
    errorType: EConnectionErrorType,
    errorMessage?: string
  ): void;

  /**
   * Attaches a TrafficSniffer instance for monitoring raw transport traffic.
   *
   * @param sniffer - Sniffer instance.
   * @returns void
   */
  setSniffer(sniffer: any): void;
}

/**
 * Detailed metadata and status record for a registered transport.
 */
export interface ITransportInfo {
  /**
   * Unique transport identifier.
   */
  id: string;

  /**
   * Driver type of the transport.
   */
  type: TTransportType;

  /**
   * The underlying transport driver instance.
   */
  transport: ITransport;

  /**
   * Dedicated PollingManager managing cyclic polling tasks on this transport.
   */
  pollingManager: PollingManager;

  /**
   * Current connection status.
   */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';

  /**
   * Array of slave device IDs currently bound to this transport.
   */
  slaveIds: number[];

  /**
   * Physical standard mode.
   */
  rsMode: TRSMode;

  /**
   * Fallback connection paths or hosts.
   */
  fallbacks: string[];

  /**
   * Creation timestamp.
   */
  createdAt: Date;

  /**
   * Last caught connection error, if any.
   */
  lastError?: Error;

  /**
   * Current number of consecutive reconnection attempts.
   */
  reconnectAttempts: number;

  /**
   * Maximum allowed reconnection attempts before giving up.
   */
  maxReconnectAttempts: number;

  /**
   * Interval in milliseconds between reconnection attempts.
   */
  reconnectInterval: number;
}

/**
 * Lightweight runtime status summary for a transport.
 */
export interface ITransportStatus {
  /**
   * Transport identifier.
   */
  id: string;

  /**
   * True if transport is currently connected.
   */
  connected: boolean;

  /**
   * Last recorded error, if present.
   */
  lastError?: Error;

  /**
   * Array of connected slave device IDs.
   */
  connectedSlaveIds: number[];

  /**
   * Total uptime in milliseconds since connection was established.
   */
  uptime: number;

  /**
   * Number of reconnect attempts performed.
   */
  reconnectAttempts: number;

  /**
   * Polling scheduler metrics if available.
   */
  pollingStats?: {
    /**
     * Number of pending polling tasks in queue.
     */
    queueLength: number;

    /**
     * Number of polling tasks currently running.
     */
    tasksRunning: number;

    /**
     * Number of clients registered on the owning port session.
     */
    clientsCount?: number;
  };
}

// ===================================================
// POLLING MANAGER
// ===================================================

/**
 * Interface for managing periodic polling tasks on a transport.
 * Coordinates task intervals, priorities, execution concurrency, and retries.
 */
export interface IPollingManager {
  /**
   * Adds a new polling task to the scheduler.
   *
   * @param options - Configuration options for the task.
   * @returns void
   */
  addTask(options: IPollingTaskOptions): void;

  /**
   * Updates an existing polling task with new options.
   *
   * @param id - Task identifier.
   * @param newOptions - New configuration options.
   * @returns A Promise resolving when update is complete.
   */
  updateTask(id: string, newOptions: IPollingTaskOptions): Promise<void>;

  /**
   * Stops and permanently removes a polling task by ID.
   *
   * @param id - Task identifier.
   * @returns void
   */
  removeTask(id: string): void;

  /**
   * Restarts an existing polling task.
   *
   * @param id - Task identifier.
   * @returns void
   */
  restartTask(id: string): void;

  /**
   * Starts a stopped polling task.
   *
   * @param id - Task identifier.
   * @returns void
   */
  startTask(id: string): void;

  /**
   * Stops an active polling task.
   *
   * @param id - Task identifier.
   * @returns void
   */
  stopTask(id: string): void;

  /**
   * Pauses an active polling task without unregistering it.
   *
   * @param id - Task identifier.
   * @returns void
   */
  pauseTask(id: string): void;

  /**
   * Resumes a paused polling task.
   *
   * @param id - Task identifier.
   * @returns void
   */
  resumeTask(id: string): void;

  /**
   * Updates the execution interval of an existing polling task.
   *
   * @param id - Task identifier.
   * @param interval - New interval in milliseconds.
   * @returns void
   */
  setTaskInterval(id: string, interval: number): void;

  /**
   * Checks whether a task is currently executing or active.
   *
   * @param id - Task identifier.
   * @returns True if running, false otherwise.
   */
  isTaskRunning(id: string): boolean;

  /**
   * Checks whether a task is currently paused.
   *
   * @param id - Task identifier.
   * @returns True if paused, false otherwise.
   */
  isTaskPaused(id: string): boolean;

  /**
   * Retrieves the current execution state flags of a task.
   *
   * @param id - Task identifier.
   * @returns State object, or null if task not found.
   */
  getTaskState(id: string): IPollingTaskState | null;

  /**
   * Checks whether a task exists in the manager.
   *
   * @param id - Task identifier.
   * @returns True if task exists, false otherwise.
   */
  hasTask(id: string): boolean;

  /**
   * Retrieves all registered task identifiers.
   *
   * @returns Array of task ID strings.
   */
  getTaskIds(): string[];

  /**
   * Removes and stops all registered polling tasks.
   *
   * @returns void
   */
  clearAll(): void;

  /**
   * Restarts all registered polling tasks.
   *
   * @returns void
   */
  restartAllTasks(): void;

  /**
   * Pauses all registered polling tasks.
   *
   * @returns void
   */
  pauseAllTasks(): void;

  /**
   * Resumes all paused polling tasks.
   *
   * @returns void
   */
  resumeAllTasks(): void;

  /**
   * Starts all registered polling tasks.
   *
   * @returns void
   */
  startAllTasks(): void;

  /**
   * Stops all registered polling tasks.
   *
   * @returns void
   */
  stopAllTasks(): void;

  /**
   * Stops and removes all tasks belonging to a specific client.
   *
   * @param clientId - Client identifier.
   * @returns Array of removed task IDs.
   */
  removeTasksByClient(clientId: string): string[];

  /**
   * Retrieves current queue status including tasks and lengths.
   *
   * @returns Polling queue information object.
   */
  getQueueInfo(): IPollingQueueInfo;

  /**
   * Retrieves high-level scheduler statistics.
   *
   * @returns Polling system statistics object.
   */
  getSystemStats(): IPollingSystemStats;

  /**
   * Binds the manager to a port queue so it becomes a pure scheduler over that queue.
   *
   * @param fn - Queue submission function.
   * @returns void
   */
  setEnqueueFn(fn: TPollingEnqueueFn): void;

  /**
   * Registers a provider of live port-queue and client counters.
   *
   * @param provider - Function returning queue length and client count.
   * @returns void
   */
  setQueueStatsProvider(provider: TPollingQueueStatsProvider): void;

  /**
   * Enqueues an internal task controller for execution.
   *
   * @param task - Task controller instance.
   * @returns void
   */
  enqueueTask(task: ITaskController): void;

  /**
   * Removes a task from the active execution queue.
   *
   * @param taskId - Task identifier.
   * @returns void
   */
  removeFromQueue(taskId: string): void;

  /**
   * Executes a manual asynchronous function immediately, preempting polling tasks.
   *
   * @template T - Return type.
   * @param fn - Function returning a Promise to execute.
   * @returns Promise resolving to the function's result.
   */
  executeImmediate<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Sets logging level for the polling manager logger.
   *
   * @param level - Log level string ('silent', 'debug', 'info', etc.).
   * @returns void
   */
  setLogLevel(level: string): void;

  /**
   * Silences all log output from the polling manager and its tasks.
   *
   * @returns void
   */
  disableAllLoggers(): void;
}

/**
 * Control action enum for individual polling tasks.
 */
export enum EPollingAction {
  Start = 'start',
  Stop = 'stop',
  Pause = 'pause',
  Resume = 'resume',
}

/**
 * Control action enum for bulk polling task operations across a transport.
 */
export enum EPollingBulkAction {
  StartAll = 'startAll',
  StopAll = 'stopAll',
  PauseAll = 'pauseAll',
  ResumeAll = 'resumeAll',
}

/**
 * Allowed actions on an individual polling task.
 */
export type TPollingAction = EPollingAction | 'start' | 'stop' | 'pause' | 'resume';

/**
 * Allowed bulk actions on all polling tasks of a transport.
 */
export type TPollingBulkAction =
  | EPollingBulkAction
  | 'startAll'
  | 'stopAll'
  | 'pauseAll'
  | 'resumeAll';

/**
 * Configuration options for initializing a PollingManager.
 */
export interface IPollingManagerConfig {
  /**
   * Default maximum retry attempts for failing tasks (default: 0).
   */
  defaultMaxRetries?: number;

  /**
   * Delay in milliseconds for exponential backoff between retries (default: 500).
   */
  defaultBackoffDelay?: number;

  /**
   * Maximum allowed execution duration per task in milliseconds before timing out.
   */
  defaultTaskTimeout?: number;

  /**
   * Delay in milliseconds between the completion of one task and the start of another.
   */
  interTaskDelay?: number;

  /**
   * Logging level for the polling manager.
   */
  logLevel?: TManagerLogLevel;

  /**
   * Custom tslog Logger instance to use.
   */
  logger?: Logger<ILogObj>;

  /**
   * Task-level concurrency model:
   * - `strict` (default): runs one task at a time; serialized by the port queue.
   * - `per-slave`: legacy behaviour with one lock per declared slave.
   */
  concurrency?: 'strict' | 'per-slave';
}

/**
 * Signature of the port-queue `enqueue` function the polling manager submits jobs to.
 */
export type TPollingEnqueueFn = <T>(
  fn: () => Promise<T> | T,
  opts?: IPortQueueEnqueueOptions
) => Promise<T>;

/**
 * Provides live port-queue and client counters for polling statistics.
 */
export type TPollingQueueStatsProvider = () => { queueLength: number; clientsCount: number };

/**
 * Configuration options for creating a polling task.
 */
export interface IPollingTaskOptions {
  /**
   * Unique identifier for the polling task.
   */
  id: string;

  /**
   * Task owner: the `clientId` from `createClient()`. Tasks with an owner are automatically
   * stopped and removed along with the client (`removeClient`).
   */
  clientId?: string;

  /**
   * Task execution priority (lower number indicates higher priority, default: 10).
   */
  priority?: number;

  /**
   * Polling interval in milliseconds between successive task executions.
   */
  interval: number;

  /**
   * Function or array of functions to execute cyclically.
   * Can receive an optional AbortSignal.
   */
  fn:
    | ((signal?: AbortSignal) => unknown | Promise<unknown>)
    | Array<(signal?: AbortSignal) => unknown | Promise<unknown>>;

  /**
   * Callback invoked with accumulated results upon successful task execution.
   */
  onData?: (data: unknown[]) => void;

  /**
   * Callback invoked when a function execution fails.
   */
  onError?: (error: Error, fnIndex: number, retryCount: number) => void;

  /**
   * Callback invoked when the task cycle begins.
   */
  onStart?: () => void;

  /**
   * Callback invoked when the task is stopped.
   */
  onStop?: () => void;

  /**
   * Callback invoked after execution finishes, indicating success status and result data.
   */
  onFinish?: (success: boolean, results: unknown[]) => void;

  /**
   * Callback invoked before each individual function in the task is executed.
   */
  onBeforeEach?: () => void;

  /**
   * Callback invoked when a failed function is retried.
   */
  onRetry?: (error: Error, fnIndex: number, retryCount: number) => void;

  /**
   * Guard predicate evaluated before execution; if returns false, execution is skipped.
   */
  shouldRun?: () => boolean;

  /**
   * Callback invoked on successful completion of a single function.
   */
  onSuccess?: (result: unknown) => void;

  /**
   * Callback invoked when task execution permanently fails after retries.
   */
  onFailure?: (error: Error) => void;

  /**
   * Human-readable display name for the task.
   */
  name?: string;

  /**
   * If true, runs the task immediately upon registration without waiting for first interval.
   */
  immediate?: boolean;

  /**
   * Maximum retry attempts for this specific task.
   */
  maxRetries?: number;

  /**
   * Backoff delay in milliseconds between retries.
   */
  backoffDelay?: number;

  /**
   * Timeout in milliseconds for completing the task execution.
   */
  taskTimeout?: number;
}

/**
 * Runtime execution state flags of a polling task.
 */
export interface IPollingTaskState {
  /**
   * True if task has been permanently stopped.
   */
  stopped: boolean;

  /**
   * True if task is currently paused.
   */
  paused: boolean;

  /**
   * True if task is scheduled and active.
   */
  running: boolean;

  /**
   * True while task function is actively executing on the line.
   */
  inProgress: boolean;
}

/**
 * Snapshot of polling queue contents and states.
 */
export interface IPollingQueueInfo {
  /**
   * Number of tasks waiting in queue.
   */
  queueLength: number;

  /**
   * List of tasks in the queue with their current states.
   */
  tasks: Array<{
    id: string;
    state: IPollingTaskState;
  }>;

  /**
   * Length of the session port queue (present when the manager is bound to a session).
   */
  portQueueLength?: number;

  /**
   * Number of clients on the owning port session.
   */
  clientsCount?: number;
}

/**
 * Aggregated statistics across the polling manager subsystem.
 */
export interface IPollingSystemStats {
  /**
   * Total number of registered polling tasks.
   */
  totalTasks: number;

  /**
   * Total number of managed queues.
   */
  totalQueues: number;

  /**
   * Current number of queued tasks.
   */
  queuedTasks: number;

  /**
   * Length of the session port queue.
   */
  portQueueLength?: number;

  /**
   * Number of clients on the owning port session.
   */
  clientsCount?: number;
}

/**
 * Internal interface representing an active polling task controller.
 */
export interface ITaskController {
  /**
   * Starts the task scheduler loop.
   */
  start(): void;

  /**
   * Stops the task scheduler loop.
   */
  stop(): void;

  /**
   * Pauses task execution.
   */
  pause(): void;

  /**
   * Resumes task execution.
   */
  resume(): void;

  /**
   * Triggers an immediate execution cycle.
   */
  execute(): Promise<void>;

  /**
   * Checks whether the task is running.
   */
  isRunning(): boolean;

  /**
   * Checks whether the task is paused.
   */
  isPaused(): boolean;

  /**
   * Updates interval in milliseconds.
   */
  setInterval(ms: number): void;

  /**
   * Returns current task state flags.
   */
  getState(): IPollingTaskState;
}

// ===================================================
// TRANSPORT CONTROLLER
// ===================================================

/**
 * Main orchestrator for managing Modbus connections, client instances,
 * traffic routing, scanning, and background polling.
 */
export interface ITransportController {
  /**
   * Global traffic sniffer instance if enabled in options, otherwise null.
   */
  readonly sniffer: any | null;

  /**
   * Disables logging across the controller.
   *
   * @returns void
   */
  disableLogger(): void;

  /**
   * Enables logging across the controller.
   *
   * @returns void
   */
  enableLogger(): void;

  /**
   * Scans a serial RTU port for connected Modbus slave devices.
   *
   * @param options - Scanning options (baud rates, parities, slave IDs, profile).
   * @returns A Promise resolving to an IScanReport containing results and metrics.
   */
  scanRtuPort(options: IScanOptions): Promise<IScanReport>;

  /**
   * Scans a TCP network target or gateway for Modbus units.
   *
   * @param options - Scanning options (hosts, ports, unit IDs, profile).
   * @returns A Promise resolving to an IScanReport containing results and metrics.
   */
  scanTcpPort(options: IScanOptions): Promise<IScanReport>;

  /**
   * Pauses the active scan operation.
   *
   * @returns void
   */
  pauseScan(): void;

  /**
   * Resumes a paused scan operation.
   *
   * @returns void
   */
  resumeScan(): void;

  /**
   * Stops and terminates the active scan operation.
   *
   * @returns void
   */
  stopScan(): void;

  /**
   * Registers and initializes a new transport session.
   *
   * @param id - Unique identifier for the transport.
   * @param type - Transport driver type ('node-rtu', 'node-tcp', etc.).
   * @param options - Connection options for the driver.
   * @param reconnectOptions - Optional reconnection policy parameters.
   * @param pollingConfig - Optional configuration for the transport's PollingManager.
   * @param queueOptions - Optional configuration for the serialized PortQueue.
   * @returns A Promise resolving when transport session is created and registered.
   */
  addTransport(
    id: string,
    type: TTransportType,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: IPollingManagerConfig,
    queueOptions?: IPortQueueOptions
  ): Promise<void>;

  /**
   * Removes a transport, stopping its polling manager and releasing its port.
   *
   * @param id - Identifier of the transport to remove.
   * @returns A Promise resolving when removal is complete.
   */
  removeTransport(id: string): Promise<void>;

  /**
   * Retrieves the raw transport driver instance by ID.
   *
   * @deprecated Use `getSession(id)` to obtain the complete PortSession (transport + queue).
   * @param id - Transport identifier.
   * @returns Transport instance, or null if not found.
   */
  getTransport(id: string): ITransport | null;

  /**
   * Returns the port session for an ID (transport + queue + polling manager + clients).
   *
   * @param id - Transport identifier.
   * @returns PortSession instance, or null if not found.
   */
  getSession(id: string): IPortSession | null;

  /**
   * Creates a ModbusClient bound to a port session with framing automatically derived from RS mode.
   *
   * @param options - Client creation options including slaveId and optional transportId.
   * @returns A Promise resolving to the configured ModbusClient instance.
   */
  createClient(options: ICreateClientOptions): Promise<ModbusClient>;

  /**
   * Retrieves a registered client by its unique identifier.
   *
   * @param clientId - Client identifier.
   * @returns ModbusClient instance, or null if not found.
   */
  getClient(clientId: string): ModbusClient | null;

  /**
   * Reassigns a registered client to a different Modbus slave address.
   *
   * @param clientId - Client identifier.
   * @param newSlaveId - New slave unit address (1-255).
   * @param options - Optional reassignment options (e.g., allowDuplicateSlaveId).
   * @returns A Promise resolving once reassignment is complete.
   */
  reassignClient(
    clientId: string,
    newSlaveId: number,
    options?: IReassignClientOptions
  ): Promise<void>;

  /**
   * Lists all registered client descriptions, optionally filtered by transport ID.
   *
   * @param transportId - Optional transport ID filter.
   * @returns Array of client information records.
   */
  listClients(transportId?: string): IClientInfo[];

  /**
   * Removes a client and cleans up its polling tasks and device state.
   *
   * @param clientId - Client identifier.
   * @returns A Promise resolving once client is removed.
   */
  removeClient(clientId: string): Promise<void>;

  /**
   * Lists information and status for all registered transports.
   *
   * @returns Array of transport information records.
   */
  listTransports(): ITransportInfo[];

  /**
   * Performs a hot reload of a transport's connection configuration.
   *
   * @param id - Transport identifier.
   * @param options - New transport connection options.
   * @returns A Promise resolving once the transport has reloaded.
   */
  reloadTransport(
    id: string,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort })
  ): Promise<void>;

  /**
   * Connects all registered transports.
   *
   * @returns A Promise resolving when all transports finish connecting.
   */
  connectAll(): Promise<void>;

  /**
   * Disconnects all registered transports and pauses polling.
   *
   * @returns A Promise resolving when all transports are disconnected.
   */
  disconnectAll(): Promise<void>;

  /**
   * Connects a specific transport by ID.
   *
   * @param id - Transport identifier.
   * @returns A Promise resolving when connection is established.
   */
  connectTransport(id: string): Promise<void>;

  /**
   * Disconnects a specific transport by ID and stops its active operations.
   *
   * @param id - Transport identifier.
   * @returns A Promise resolving when transport is disconnected.
   */
  disconnectTransport(id: string): Promise<void>;

  /**
   * Resolves the transport driver serving a given slave ID and RS mode.
   *
   * @param slaveId - Slave unit address.
   * @param requiredRSMode - Required physical RS standard.
   * @returns Transport instance, or null if not found.
   */
  getTransportForSlave(slaveId: number, requiredRSMode: TRSMode): ITransport | null;

  /**
   * Resolves the port session (transport + shared queue) for a slave ID and RS mode.
   *
   * @param slaveId - Slave unit address.
   * @param requiredRSMode - Required physical RS standard.
   * @returns PortSession instance, or null if not found.
   */
  getSessionForSlave(slaveId: number, requiredRSMode: TRSMode): IPortSession | null;

  /**
   * Assigns a slave device address to a transport channel.
   *
   * @param transportId - Transport identifier.
   * @param slaveId - Slave unit address.
   * @returns A Promise resolving when the assignment is recorded.
   * @throws {RSModeConstraintError} If transport is RS232 and already has a device assigned.
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): Promise<void>;

  /**
   * Unassigns a slave device address from a transport channel.
   *
   * @param transportId - Transport identifier.
   * @param slaveId - Slave unit address.
   * @returns A Promise resolving when the unassignment is complete.
   */
  removeSlaveIdFromTransport(transportId: string, slaveId: number): Promise<void>;

  /**
   * Retrieves runtime status for a specific transport or all transports.
   *
   * @param id - Optional transport identifier.
   * @returns Status record for one transport, or mapping of all statuses.
   */
  getStatus(id?: string): ITransportStatus | Record<string, ITransportStatus>;

  /**
   * Returns the count of transports that are currently in 'connected' status.
   *
   * @returns Count of active connected transports.
   */
  getActiveTransportCount(): number;

  /**
   * Sets the global device state handler called for any device state change.
   *
   * @param handler - Callback receiving (slaveId, connected, errorInfo).
   * @returns void
   */
  setDeviceStateHandler(handler: TDeviceStateHandler): void;

  /**
   * Sets the global port state handler called for any port state change.
   *
   * @param handler - Callback receiving (connected, slaveIds, errorInfo).
   * @returns void
   */
  setPortStateHandler(handler: TPortStateHandler): void;

  /**
   * Registers a device state handler scoped to a specific transport.
   *
   * @param transportId - Transport identifier.
   * @param handler - Callback receiving (slaveId, connected, errorInfo).
   * @returns A Promise resolving once handler is wired.
   */
  setDeviceStateHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void>;

  /**
   * Registers a port state handler scoped to a specific transport.
   *
   * @param transportId - Transport identifier.
   * @param handler - Callback receiving (connected, slaveIds, errorInfo).
   * @returns A Promise resolving once handler is wired.
   */
  setPortStateHandlerForTransport(transportId: string, handler: TPortStateHandler): Promise<void>;

  /**
   * Adds a polling task to a specific transport's polling manager.
   *
   * @param transportId - Transport identifier.
   * @param options - Polling task options.
   * @returns void
   */
  addPollingTask(transportId: string, options: IPollingTaskOptions): void;

  /**
   * Removes a polling task from a transport's polling manager.
   *
   * @param transportId - Transport identifier.
   * @param taskId - Task identifier.
   * @returns void
   */
  removePollingTask(transportId: string, taskId: string): void;

  /**
   * Updates an existing polling task on a transport.
   *
   * @param transportId - Transport identifier.
   * @param taskId - Task identifier.
   * @param newOptions - Partial updated options.
   * @returns A Promise resolving when update is complete.
   */
  updatePollingTask(
    transportId: string,
    taskId: string,
    newOptions: Partial<IPollingTaskOptions>
  ): Promise<void>;

  /**
   * Controls the execution state of an individual polling task (start, stop, pause, resume).
   *
   * @param transportId - Transport identifier.
   * @param taskId - Task identifier.
   * @param action - Desired action.
   * @returns void
   */
  controlTask(transportId: string, taskId: string, action: TPollingAction): void;

  /**
   * Controls all polling tasks on a transport in bulk (startAll, stopAll, pauseAll, resumeAll).
   *
   * @param transportId - Transport identifier.
   * @param action - Desired bulk action.
   * @returns void
   */
  controlPolling(transportId: string, action: TPollingBulkAction): void;

  /**
   * Retrieves polling queue metrics for a transport.
   *
   * @param transportId - Transport identifier.
   * @returns Polling queue information object.
   */
  getPollingQueueInfo(transportId: string): IPollingQueueInfo;

  /**
   * Executes an asynchronous operation immediately on a transport via its PortQueue,
   * avoiding collisions with background polling.
   *
   * @template T - Return type.
   * @param transportId - Transport identifier.
   * @param fn - Function returning a Promise to execute.
   * @returns Promise resolving to the result.
   */
  executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Shuts down the controller, disconnects all transports, stops all polling, and releases resources.
   *
   * @returns A Promise resolving when destruction is complete.
   */
  destroy(): Promise<void>;
}

/**
 * Options for configuring a TransportController instance.
 */
export interface ITransportControllerOptions {
  /**
   * Whether to instantiate and enable the global TrafficSniffer.
   */
  sniffer?: boolean;
}

// ===================================================
// DEVICE/PORT STATE HANDLERS
// ===================================================

/**
 * Callback function signature for receiving device connection state transitions.
 *
 * @param slaveId - Modbus slave unit address (1-247).
 * @param connected - True if device responded successfully, false if timed out or failed.
 * @param error - Error details if disconnected.
 */
export type TDeviceStateHandler = (
  slaveId: number,
  connected: boolean,
  error?: { type: EConnectionErrorType; message: string }
) => void;

/**
 * Callback function signature for receiving physical/network port state transitions.
 *
 * @param connected - True if port is open and operational, false if closed or dropped.
 * @param slaveIds - Array of slave IDs associated with this port.
 * @param error - Error details if disconnected.
 */
export type TPortStateHandler = (
  connected: boolean,
  slaveIds: number[],
  error?: { type: EConnectionErrorType; message: string }
) => void;

// ===================================================
// SCAN
// ===================================================

/**
 * Predefined scan profile types:
 * - 'quick': Common speeds (9600-115200), standard parities, high concurrency.
 * - 'deep': Comprehensive sweep of all baud rates down to 1200, all parities, lower concurrency.
 * - 'custom': User-defined explicit baud rates, parities, and timeouts.
 */
export type TScanProfile = 'quick' | 'deep' | 'custom';

/**
 * Performance and diagnostic statistics collected during a scan operation.
 */
export interface IScanStats {
  /**
   * Total elapsed scan duration in milliseconds.
   */
  durationMs: number;

  /**
   * Total number of probe requests transmitted.
   */
  probesSent: number;

  /**
   * Number of probes that timed out with no response.
   */
  timeouts: number;

  /**
   * Number of responses that failed CRC checksum validation (RTU).
   */
  crcErrors: number;

  /**
   * Number of exception responses returned by slaves.
   */
  exceptionResponses: number;
}

/**
 * Final discovery report generated by a scan operation.
 */
export interface IScanReport {
  /**
   * Array of verified Modbus devices discovered during the scan.
   */
  results: IScanResult[];

  /**
   * Statistical metrics collected throughout the scan.
   */
  stats: IScanStats;
}

/**
 * Progress status information emitted during an RTU serial scan.
 */
export interface IScanProgressRtu {
  /**
   * Baud rate currently being probed.
   */
  baud: number;

  /**
   * Parity mode currently being probed.
   */
  parity: TParityType;

  /**
   * Stop bits currently being probed.
   */
  stopBits: 1 | 2;

  /**
   * Slave address currently being probed.
   */
  slaveId: number;
}

/**
 * Progress status information emitted during a TCP network scan.
 */
export interface IScanProgressTcp {
  /**
   * Host address currently being scanned.
   */
  host: string;

  /**
   * TCP port currently being scanned.
   */
  port: number;

  /**
   * Unit ID currently being probed.
   */
  unitId: number;
}

/**
 * Details of a single discovered Modbus device or unit.
 */
export interface IScanResult {
  /**
   * Type of transport on which the device was detected.
   */
  type: 'node-rtu' | 'node-tcp' | 'web-rtu';

  /**
   * Discovered Modbus slave address or unit ID.
   */
  slaveId: number;

  /**
   * Working baud rate (RTU only).
   */
  baudRate?: number;

  /**
   * Working parity mode (RTU only).
   */
  parity?: TParityType;

  /**
   * Serial port system path (RTU only).
   */
  port?: string;

  /**
   * Stop bits used during discovery (RTU only).
   */
  stopBits?: 1 | 2;

  /**
   * Host IP address or domain (TCP only).
   */
  host?: string;

  /**
   * TCP port number (TCP only).
   */
  tcpPort?: number;

  /**
   * Epoch timestamp in milliseconds when the device was found.
   */
  discoveredAt: number;
}

/**
 * Controller handle for externally controlling an ongoing scan operation.
 */
export interface IScanController {
  /**
   * Pauses the scan operation.
   */
  pause: () => void;

  /**
   * Resumes a paused scan operation.
   */
  resume: () => void;

  /**
   * Immediately terminates the scan and closes open ports/sockets.
   */
  stop: () => void;

  /**
   * Resets scan state to initial conditions.
   */
  reset: () => void;

  /**
   * Indicates whether the scan is currently paused.
   */
  readonly isPaused: boolean;

  /**
   * Indicates whether the scan has been stopped.
   */
  readonly isStopped: boolean;
}

/**
 * Configuration options passed to scanRtuPort or scanTcpPort.
 */
export interface IScanOptions {
  /**
   * Required scan profile presets ('quick', 'deep', or 'custom').
   */
  profile: TScanProfile;

  /**
   * Verification register address to read from each device (default: 0).
   */
  registerAddress?: number;

  /**
   * Serial port path (Node.js) or IWebSerialPort object (browser).
   */
  path?: string | IWebSerialPort;

  /**
   * Transport driver type for RTU scans ('node-rtu' or 'web-rtu').
   */
  type?: 'node-rtu' | 'web-rtu';

  /**
   * List of baud rates to test.
   */
  bauds?: number[];

  /**
   * List of parity modes to test.
   */
  parities?: TParityType[];

  /**
   * Array of slave addresses to scan (1-247).
   */
  slaveIds?: number[];

  /**
   * Array of target host IP addresses (TCP scans).
   */
  hosts?: string[];

  /**
   * Array of target TCP ports (default: [502]).
   */
  ports?: number[];

  /**
   * Array of unit IDs to probe (TCP scans).
   */
  unitIds?: number[];

  /**
   * Optional ScanController instance for external pause/resume/stop control.
   */
  controller?: IScanController;

  /**
   * Extra timeout padding in milliseconds added to RTU calculations.
   */
  padding?: number;

  /**
   * Maximum concurrent requests during TCP scans.
   */
  concurrency?: number;

  /**
   * Timeout in milliseconds for TCP requests.
   */
  tcpTimeout?: number;

  /**
   * If true, reports all baud rates where a device was found instead of deduplicating.
   */
  multiBaud?: boolean;

  /**
   * Standard AbortSignal for canceling the scan.
   */
  signal?: AbortSignal;

  /**
   * List of stop bits to scan (RTU only, e.g., [1, 2]).
   */
  stopBitsList?: (1 | 2)[];

  /**
   * Callback fired on each scan probe attempt.
   */
  onProgress?: (current: number, total: number, info: IScanProgressRtu | IScanProgressTcp) => void;

  /**
   * Callback fired immediately when a device is discovered.
   */
  onDeviceFound?: (device: IScanResult) => void;

  /**
   * Callback fired when the entire scan process completes.
   */
  onFinish?: (results: IScanResult[]) => void;

  /**
   * Callback fired with finalized scan metrics and statistics.
   */
  onStats?: (stats: IScanStats) => void;

  /**
   * Callback fired on each successful verification register read.
   */
  onRegisterRead?: (slaveId: number, registerAddress: number, value: number) => void;
}

// ===================================================
// TRANSPORT OPTIONS
// ===================================================

/**
 * Options for configuring a Node.js Serial RTU transport driver.
 */
export interface INodeSerialTransportOptions {
  /**
   * Minimum bus silence (ms) after the last received byte before sending
   * the next request. RTU requires an inter-frame pause (>=3.5 characters), and
   * a USB-to-RS485 adapter needs time to switch from receive to transmit mode.
   * Default is 0 (disabled).
   */
  interFrameDelayMs?: number;

  /**
   * Exclusive port access (default: true): if the port is already in use by another process,
   * the connection fails with an explicit error instead of sharing the line.
   */
  exclusiveLock?: boolean;

  /**
   * Baud rate (e.g., 9600, 19200, 115200). Default is 9600.
   */
  baudRate?: number;

  /**
   * Number of data bits per frame (5, 6, 7, or 8). Default is 8.
   */
  dataBits?: 5 | 6 | 7 | 8;

  /**
   * Number of stop bits (1 or 2). Default is 1.
   */
  stopBits?: 1 | 2;

  /**
   * Parity checking mode ('none', 'even', 'odd', etc.). Default is 'none'.
   */
  parity?: TParityType;

  /**
   * Read timeout in milliseconds (default: 1000).
   */
  readTimeout?: number;

  /**
   * Write timeout in milliseconds (default: 1000).
   */
  writeTimeout?: number;

  /**
   * Maximum internal read buffer size in bytes (default: 65536).
   */
  maxBufferSize?: number;

  /**
   * Interval in milliseconds between automatic reconnect attempts (default: 3000).
   */
  reconnectInterval?: number;

  /**
   * Maximum number of automatic reconnect attempts before giving up (default: Infinity).
   */
  maxReconnectAttempts?: number;

  /**
   * Physical transmission standard ('RS485' or 'RS232'). Default is 'RS485'.
   */
  RSMode?: TRSMode;

  /**
   * Additional driver-specific options.
   */
  [key: string]: unknown;
}

/**
 * Options for configuring a Node.js TCP transport driver.
 */
export interface INodeTcpTransportOptions {
  /**
   * Read timeout in milliseconds (default: 1000).
   */
  readTimeout?: number;

  /**
   * Write timeout in milliseconds (default: 1000).
   */
  writeTimeout?: number;

  /**
   * Maximum internal read buffer size in bytes (default: 65536).
   */
  maxBufferSize?: number;

  /**
   * Interval in milliseconds between reconnect attempts (default: 3000).
   */
  reconnectInterval?: number;

  /**
   * Maximum number of reconnect attempts before giving up (default: Infinity).
   */
  maxReconnectAttempts?: number;
}

/**
 * Minimal abstraction for a browser Web Serial API port object.
 */
export interface IWebSerialPort {
  /**
   * Opens the serial port with the specified configuration options.
   */
  open(options: IWebSerialPortOptions): Promise<void>;

  /**
   * Closes the serial port.
   */
  close(): Promise<void>;

  /**
   * Readable byte stream from the port.
   */
  readonly readable: ReadableStream<Uint8Array> | null;

  /**
   * Writable byte stream to the port.
   */
  readonly writable: WritableStream<Uint8Array> | null;

  /**
   * Indicates whether the port is currently open.
   */
  readonly opened: boolean;
}

/**
 * Options passed to IWebSerialPort.open().
 */
export interface IWebSerialPortOptions {
  /**
   * Serial baud rate.
   */
  baudRate: number;

  /**
   * Number of data bits (typically 8).
   */
  dataBits: number;

  /**
   * Number of stop bits (1 or 2).
   */
  stopBits: number;

  /**
   * Parity verification mode.
   */
  parity: TParityType;

  /**
   * Hardware flow control mode ('none').
   */
  flowControl: 'none';
}

/**
 * Options for configuring a WebSerial transport driver.
 */
export interface IWebSerialTransportOptions {
  /**
   * Serial baud rate (default: 9600).
   */
  baudRate?: number;

  /**
   * Number of data bits (default: 8).
   */
  dataBits?: number;

  /**
   * Number of stop bits (default: 1).
   */
  stopBits?: number;

  /**
   * Parity mode (default: 'none').
   */
  parity?: TParityType;

  /**
   * Read timeout in milliseconds (default: 1000).
   */
  readTimeout?: number;

  /**
   * Write timeout in milliseconds (default: 1000).
   */
  writeTimeout?: number;

  /**
   * Interval in milliseconds between reconnect attempts (default: 3000).
   */
  reconnectInterval?: number;

  /**
   * Maximum number of reconnect attempts before giving up (default: Infinity).
   */
  maxReconnectAttempts?: number;

  /**
   * Number of consecutive empty reads before triggering reconnect (default: 10).
   */
  maxEmptyReadsBeforeReconnect?: number;

  /**
   * Physical standard mode ('RS485' or 'RS232'). Default is 'RS485'.
   */
  RSMode?: TRSMode;

  /**
   * Additional driver-specific options.
   */
  [key: string]: unknown;
}

// ===================================================
// EMULATOR
// ===================================================

/**
 * Memory register types supported by the Modbus slave emulator core.
 */
export type TEmulatorTypeRegister = 'Holding' | 'Input' | 'Coil' | 'Discrete';

/**
 * Core interface for the in-memory Modbus slave emulator.
 * Implements register storage, request processing, exceptions, and simulation tasks.
 */
export interface IModbusSlaveCoreEmulator {
  /**
   * Processes an incoming raw request PDU and returns the response PDU.
   *
   * @param unitId - Modbus unit/slave address.
   * @param pdu - Request Protocol Data Unit.
   * @returns Promise resolving to response PDU bytes.
   */
  processRequest(unitId: number, pdu: Uint8Array): Promise<Uint8Array>;

  /**
   * Reads an array of coil states from the emulator.
   *
   * @param startAddress - Starting coil address.
   * @param quantity - Number of coils.
   * @returns Array of boolean coil values.
   */
  readCoils(startAddress: number, quantity: number): boolean[];

  /**
   * Reads an array of discrete inputs from the emulator.
   *
   * @param startAddress - Starting input address.
   * @param quantity - Number of discrete inputs.
   * @returns Array of boolean input values.
   */
  readDiscreteInputs(startAddress: number, quantity: number): boolean[];

  /**
   * Reads an array of holding register values from the emulator.
   *
   * @param startAddress - Starting register address.
   * @param quantity - Number of registers.
   * @returns Array of 16-bit register values.
   */
  readHoldingRegisters(startAddress: number, quantity: number): number[];

  /**
   * Reads an array of input register values from the emulator.
   *
   * @param startAddress - Starting register address.
   * @param quantity - Number of registers.
   * @returns Array of 16-bit register values.
   */
  readInputRegisters(startAddress: number, quantity: number): number[];

  /**
   * Writes a single coil state in the emulator.
   *
   * @param address - Coil address.
   * @param value - Boolean state.
   * @returns void
   */
  writeSingleCoil(address: number, value: boolean): void;

  /**
   * Writes a single holding register value in the emulator.
   *
   * @param address - Register address.
   * @param value - 16-bit unsigned value.
   * @returns void
   */
  writeSingleRegister(address: number, value: number): void;

  /**
   * Bulk loads initial register and coil definitions.
   *
   * @param definitions - Definitions mapping for coils, discrete, holding, and input registers.
   * @returns void
   */
  addRegisters(definitions: IRegisterDefinitions): void;

  /**
   * Starts a simulation task that randomly varies a register's value indefinitely.
   *
   * @param params - Simulation parameters.
   * @returns void
   */
  infinityChange(params: IInfinityChangeParams): void;

  /**
   * Stops an active random change simulation task.
   *
   * @param params - Task parameters identifying the register.
   * @returns void
   */
  stopInfinityChange(params: IStopInfinityChangeParams): void;

  /**
   * Configures a custom Modbus exception response for a specific function and address.
   *
   * @param functionCode - Function code to match.
   * @param address - Register/coil address to match.
   * @param exceptionCode - Exception code to return (e.g., 0x02 for Illegal Data Address).
   * @returns void
   */
  setException(functionCode: number, address: number, exceptionCode: number): void;

  /**
   * Clears all registers, coils, active simulation tasks, and configured exceptions.
   *
   * @returns void
   */
  clearAll(): void;
}

/**
 * Options for configuring an RTU Slave Emulator transport.
 */
export interface IRtuEmulatorTransportOptions {
  /**
   * Slave address to emulate (default: 1).
   */
  slaveId?: number;

  /**
   * Whether to enable logging inside the emulator core.
   */
  loggerEnabled?: boolean;

  /**
   * Optional Device Identification string mappings (MEI object IDs to strings).
   */
  deviceIdentification?: Record<number, string>;

  /**
   * Initial register data definitions to load upon startup.
   */
  initialRegisters?: any;

  /**
   * Simulated device response latency in milliseconds.
   */
  responseLatencyMs?: number;
}

/**
 * Options for configuring a TCP Slave Emulator transport.
 */
export interface ITcpEmulatorTransportOptions {
  /**
   * Unit/slave ID to emulate (default: 1).
   */
  slaveId?: number;

  /**
   * Simulated response latency in milliseconds.
   */
  responseLatencyMs?: number;

  /**
   * Whether to enable logging inside the emulator core.
   */
  loggerEnabled?: boolean;

  /**
   * Optional Device Identification string mappings.
   */
  deviceIdentification?: Record<number, string>;

  /**
   * Initial register data definitions to load upon startup.
   */
  initialRegisters?: any;

  /**
   * Mode standard (defaults to 'TCP/IP').
   */
  RSMode?: TRSMode;
}

/**
 * Parameters for starting an infinite value changing simulation task on a register.
 */
export interface IInfinityChangeParams {
  /**
   * Register memory area ('Holding', 'Input', 'Coil', or 'Discrete').
   */
  typeRegister: TEmulatorTypeRegister;

  /**
   * Target register/coil address.
   */
  register: number;

  /**
   * Range [min, max] between which random values are generated.
   */
  range: [number, number];

  /**
   * Update period in milliseconds.
   */
  interval: number;
}

/**
 * Parameters for stopping an active infinite value change simulation task.
 */
export interface IStopInfinityChangeParams {
  /**
   * Register memory area ('Holding', 'Input', 'Coil', or 'Discrete').
   */
  typeRegister: TEmulatorTypeRegister;

  /**
   * Target register/coil address.
   */
  register: number;
}

/**
 * Single initial register or coil value specification.
 */
export interface IRegisterDefinition {
  /**
   * Starting address.
   */
  start: number;

  /**
   * Value to initialize (number for registers, boolean for coils/inputs).
   */
  value: number | boolean;
}

/**
 * Grouped initial register and coil specifications for bulk loading into an emulator.
 */
export interface IRegisterDefinitions {
  /**
   * Initial coil definitions.
   */
  coils?: IRegisterDefinition[];

  /**
   * Initial discrete input definitions.
   */
  discrete?: IRegisterDefinition[];

  /**
   * Initial holding register definitions.
   */
  holding?: IRegisterDefinition[];

  /**
   * Initial input register definitions.
   */
  input?: IRegisterDefinition[];
}

// ===================================================
// LOGGER
// ===================================================

/**
 * Log levels accepted by the port queue logger (mirrors tslog levels).
 */
export type TPortQueueLogLevel = 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log levels accepted by the polling manager logger.
 */
export type TManagerLogLevel = 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log levels accepted by the ModbusClient logger.
 */
export type TModbusClientLogLevel =
  | 'silent'
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

// ===================================================
// CLIENT ROSTER (managed clients created by the controller)
// ===================================================

/**
 * Context injected by the controller into a managed ModbusClient.
 * Framing is pre-derived from the port's RS mode, ensuring protocol correctness.
 */
export interface IClientContext {
  /**
   * Unique client identifier.
   */
  clientId: string;

  /**
   * PortSession instance to which this client is bound.
   */
  session: IPortSession;

  /**
   * Derived protocol framing ('rtu' or 'tcp').
   */
  framing: TModbusProtocolType;

  /**
   * Physical standard mode of the bound port.
   */
  rsMode: TRSMode;
}

/**
 * Options accepted by TransportController.createClient().
 * `framing` is intentionally omitted: it is derived from the port's RSMode.
 */
export interface ICreateClientOptions extends Omit<IModbusClientOptions, 'framing'> {
  /**
   * Optional custom client identifier. Auto-generated if omitted.
   */
  clientId?: string;

  /**
   * Modbus slave address for this client (1-255).
   */
  slaveId: number;

  /**
   * Allows two clients to serve the same device (same transport + slaveId).
   * Disabled by default to prevent duplicate polling and ambiguous device states.
   */
  allowDuplicateSlaveId?: boolean;

  /**
   * Explicit transport ID to bind to. When omitted, the router automatically resolves an available port.
   */
  transportId?: string;
}

/**
 * Options for reassignClient() on the TransportController.
 */
export interface IReassignClientOptions {
  /**
   * Whether to allow duplicate slave IDs on the same transport channel.
   */
  allowDuplicateSlaveId?: boolean;
}

/**
 * Public description record of a client registered on the controller.
 */
export interface IClientInfo {
  /**
   * Unique client identifier.
   */
  clientId: string;

  /**
   * Modbus slave unit address.
   */
  slaveId: number;

  /**
   * Identifier of the transport channel serving this client.
   */
  transportId: string;

  /**
   * RS mode of the transport.
   */
  rsMode: TRSMode;

  /**
   * Derived framing protocol ('rtu' or 'tcp').
   */
  framing: TModbusProtocolType;

  /**
   * Date and time when the client was registered.
   */
  createdAt: Date;
}

/**
 * Options for configuring a PortQueue instance.
 */
export interface IPortQueueOptions {
  /**
   * Hard limit on the maximum number of pending jobs (default: 500).
   */
  maxLength?: number;

  /**
   * Behaviour when the pending queue is full:
   * - `wait` (default): Caller waits for a free slot.
   * - `reject`: Rejects immediately with ModbusQueueOverflowError.
   */
  overflowPolicy?: 'wait' | 'reject';

  /**
   * Maximum wait time in milliseconds when overflowPolicy is 'wait' (0 = indefinite).
   */
  overflowWaitMs?: number;

  /**
   * Default per-job execution timeout in milliseconds; undefined disables the guard.
   */
  jobTimeoutMs?: number;

  /**
   * Log level for PortQueue diagnostic logs (default: 'info').
   */
  logLevel?: TPortQueueLogLevel;
}

/**
 * Options accepted by a single PortQueue.enqueue() call.
 */
export interface IPortQueueEnqueueOptions {
  /**
   * Job priority: lower numbers execute earlier (1 = highest priority). Equal values keep FIFO order.
   */
  priority?: number;

  /**
   * When true, inserts the job at the head of pending jobs (executed right after the active job).
   */
  immediate?: boolean;

  /**
   * Per-job execution timeout in milliseconds, overriding the queue default.
   */
  timeoutMs?: number;
}

/**
 * Snapshot of current PortQueue load metrics.
 */
export interface IPortQueueStats {
  /**
   * Number of jobs waiting in the queue to be executed.
   */
  queueLength: number;

  /**
   * 1 while a job is actively executing on the port, otherwise 0.
   */
  processing: number;
}

/**
 * The single queue (mutex + priority ordering) through which every wire-level
 * operation on a physical/network port must pass, eliminating bus collisions.
 */
export interface IPortQueue {
  /**
   * Maximum capacity of pending jobs before applying overflow policy.
   */
  readonly maxLength: number;

  /**
   * Enqueues an asynchronous operation for serialized execution on the port.
   *
   * @template T - Return type.
   * @param fn - Asynchronous function to execute.
   * @param opts - Priority and timeout options.
   * @returns Promise resolving to the result of `fn`.
   */
  enqueue<T>(fn: () => Promise<T> | T, opts?: IPortQueueEnqueueOptions): Promise<T>;

  /**
   * Pauses the queue, preventing new jobs from starting until resumed.
   *
   * @returns void
   */
  enablePause(): void;

  /**
   * Resumes the queue from a paused state.
   *
   * @returns void
   */
  disablePause(): void;

  /**
   * Checks whether the queue is currently paused.
   *
   * @returns True if paused, false otherwise.
   */
  isPaused(): boolean;

  /**
   * Checks whether no job is currently executing and no jobs are pending.
   *
   * @returns True if idle, false otherwise.
   */
  isIdle(): boolean;

  /**
   * Retrieves snapshot statistics of current queue usage.
   *
   * @returns IPortQueueStats metrics.
   */
  getStats(): IPortQueueStats;

  /**
   * Enables scan pause: pending and new enqueues reject immediately with ModbusScanActiveError.
   *
   * @returns void
   */
  enableScanPause(): void;

  /**
   * Disables scan pause, allowing normal queue operation to resume.
   *
   * @returns void
   */
  disableScanPause(): void;

  /**
   * Checks whether scan pause is currently active.
   *
   * @returns True if scan paused, false otherwise.
   */
  isScanPaused(): boolean;

  /**
   * Waits until all currently executing and pending jobs have completed.
   *
   * @param timeoutMs - Optional timeout in milliseconds.
   * @returns A Promise resolving when idle, or rejecting with ModbusBusyError on timeout.
   */
  waitIdle(timeoutMs?: number): Promise<void>;

  /**
   * Rejects all callers waiting for a free queue slot (used during teardown or port scans).
   *
   * @param error - Reason for cancellation.
   * @returns void
   */
  cancelWaiters(error: unknown): void;

  /**
   * Permanently stops the queue: rejects queued and active callers, and refuses subsequent jobs.
   *
   * @param error - Error to reject with.
   * @returns void
   */
  abort(error: unknown): void;

  /**
   * Drops all pending (queued but not yet executing) jobs, rejecting them with the given error.
   *
   * @param error - Reason for dropping.
   * @returns Number of dropped jobs.
   */
  dropPending(error: unknown): number;
}

/**
 * Snapshot description of a PortSession state.
 */
export interface IPortSessionInfo {
  /**
   * Session / transport identifier.
   */
  id: string;

  /**
   * Transport driver type.
   */
  type?: TTransportType;

  /**
   * Current connection status.
   */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';

  /**
   * Array of slave device addresses assigned to this session.
   */
  slaveIds: number[];

  /**
   * Physical standard mode.
   */
  rsMode: TRSMode;

  /**
   * Fallback connection paths or hosts.
   */
  fallbacks: string[];

  /**
   * Session creation date.
   */
  createdAt: Date;

  /**
   * Last caught error, if any.
   */
  lastError?: Error;

  /**
   * Current reconnect attempts count.
   */
  reconnectAttempts: number;

  /**
   * Maximum allowed reconnect attempts.
   */
  maxReconnectAttempts: number;

  /**
   * Reconnection interval in milliseconds.
   */
  reconnectInterval: number;
}

/**
 * A PortSession owns exactly one physical port: its transport, its serialized PortQueue,
 * its dedicated PollingManager, and its port connection tracker.
 */
export interface IPortSession {
  /**
   * Session identifier matching the transport ID.
   */
  readonly id: string;

  /**
   * Transport driver instance.
   */
  readonly transport: ITransport;

  /**
   * Serialized operation queue for the port.
   */
  readonly queue: IPortQueue;

  /**
   * Dedicated polling manager for background cyclic queries on this port.
   */
  readonly pollingManager: PollingManager;

  /**
   * Tracker monitoring port online/offline state.
   */
  readonly portTracker: PortConnectionTracker;

  /**
   * Read-only mapping of clients assigned to this port session (clientId -> client).
   */
  readonly clients: ReadonlyMap<string, ModbusClient>;

  /**
   * Status and metadata snapshot of the session.
   */
  readonly info: IPortSessionInfo;

  /**
   * Enqueues an operation onto the session's PortQueue.
   *
   * @template T - Return type.
   * @param fn - Operation function to execute.
   * @param opts - Priority and timeout options.
   * @returns Promise resolving to the result.
   */
  execute<T>(fn: () => Promise<T> | T, opts?: IPortQueueEnqueueOptions): Promise<T>;

  /**
   * Pauses the session's port queue.
   *
   * @returns void
   */
  pause(): void;

  /**
   * Resumes the session's port queue.
   *
   * @returns void
   */
  resume(): void;

  /**
   * Checks whether the session is paused.
   *
   * @returns True if paused, false otherwise.
   */
  isPaused(): boolean;

  /**
   * Checks whether the session queue is idle.
   *
   * @returns True if idle, false otherwise.
   */
  isIdle(): boolean;

  /**
   * Stops polling, drains in-flight requests, and freezes the queue for port scanning.
   *
   * @param timeoutMs - Optional wait timeout in milliseconds.
   * @returns A Promise resolving once the port is paused for scanning.
   */
  pauseForScan(timeoutMs?: number): Promise<void>;

  /**
   * Unfreezes the queue and resumes normal operations after a port scan finishes.
   *
   * @returns A Promise resolving once the session is resumed.
   */
  resumeAfterScan(): Promise<void>;

  /**
   * Installs a replacement transport instance (hot reload), keeping queue, polling manager, and clients.
   *
   * @param newTransport - New transport instance.
   * @returns A Promise resolving once reload completes.
   */
  reload(newTransport: ITransport): Promise<void>;

  /**
   * Stops polling, drains the queue, closes the transport, and resets trackers.
   *
   * @returns A Promise resolving when destruction is complete.
   */
  destroy(): Promise<void>;
}
