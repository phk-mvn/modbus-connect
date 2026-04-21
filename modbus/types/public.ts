// modbus/types/public.ts

// Публичные API типы - для внешнего использования

import { Logger } from 'pino';
import type PollingManager from '../polling/manager.js';

// ===================================================
// MODBUS CLIENT
// ===================================================

export interface IModbusClient {
  use(plugin: IModbusPlugin): void;
  executeCustomFunction(functionName: string, ...args: any[]): Promise<any>;
  disableLogger(): void;
  enableLogger(): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setSlaveId(newSlaveId: number): Promise<void>;
  readHoldingRegisters(startAddress: number, quantity: number): Promise<number[]>;
  readInputRegisters(startAddress: number, quantity: number): Promise<number[]>;
  writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<{ startAddress: number; value: number }>;
  writeMultipleRegisters(
    address: number,
    values: number[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }>;
  readCoils(startAddress: number, quantity: number, timeout?: number): Promise<boolean[]>;
  readDiscreteInputs(startAddress: number, quantity: number, timeout?: number): Promise<boolean[]>;
  writeSingleCoil(
    address: number,
    value: boolean,
    timeout?: number
  ): Promise<{ startAddress: number; value: boolean }>;
  writeMultipleCoils(
    address: number,
    values: boolean[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }>;
  reportSlaveId(
    timeout?: number
  ): Promise<{ slaveId: number; isRunning: boolean; data: Uint8Array }>;
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

export interface IModbusClientOptions {
  framing?: TModbusProtocolType;
  RSMode?: TRSMode;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  echoEnabled?: boolean;
  plugins?: TPluginConstructor[];
}

export type TPluginConstructor = new (...args: any[]) => IModbusPlugin;

export interface IModbusPlugin {
  name: string;
  customFunctionCodes?: { [functionName: string]: ICustomFunctionHandler };
}

export interface ICustomFunctionHandler {
  buildRequest: (...args: any[]) => Uint8Array;
  parseResponse: (responsePdu: Uint8Array) => any;
}

// ===================================================
// TRANSPORT
// ===================================================

export type TTransportType = 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator';
export type TRSMode = 'RS485' | 'RS232' | 'TCP/IP';
export type TParityType = 'none' | 'even' | 'mark' | 'odd' | 'space';
export type TModbusProtocolType = 'rtu' | 'tcp';

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

export interface ITransport {
  readonly isOpen: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  getRSMode(): TRSMode;

  setDeviceStateHandler(handler: TDeviceStateHandler): void;
  setPortStateHandler(handler: TPortStateHandler): void;
  disableDeviceTracking(): Promise<void>;
  enableDeviceTracking(handler?: TDeviceStateHandler): Promise<void>;
  notifyDeviceConnected?(slaveId: number): void;
  notifyDeviceDisconnected?(
    slaveId: number,
    errorType: EConnectionErrorType,
    errorMessage?: string
  ): void;

  setSniffer(sniffer: any): void;
}

export interface ITransportInfo {
  id: string;
  type: TTransportType;
  transport: ITransport;
  pollingManager: PollingManager;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  slaveIds: number[];
  rsMode: TRSMode;
  fallbacks: string[];
  createdAt: Date;
  lastError?: Error;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
}

export interface ITransportStatus {
  id: string;
  connected: boolean;
  lastError?: Error;
  connectedSlaveIds: number[];
  uptime: number;
  reconnectAttempts: number;
  pollingStats?: {
    queueLength: number;
    tasksRunning: number;
  };
}

// ===================================================
// POLLING MANAGER
// ===================================================

export interface IPollingManager {
  addTask(options: IPollingTaskOptions): void;
  updateTask(id: string, newOptions: IPollingTaskOptions): void;
  removeTask(id: string): void;
  restartTask(id: string): void;
  startTask(id: string): void;
  stopTask(id: string): void;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  setTaskInterval(id: string, interval: number): void;
  isTaskRunning(id: string): boolean;
  isTaskPaused(id: string): boolean;
  getTaskState(id: string): IPollingTaskState | null;
  hasTask(id: string): boolean;
  getTaskIds(): string[];
  clearAll(): void;
  restartAllTasks(): void;
  pauseAllTasks(): void;
  resumeAllTasks(): void;
  startAllTasks(): void;
  stopAllTasks(): void;
  getQueueInfo(): IPollingQueueInfo;
  getSystemStats(): IPollingSystemStats;
  enqueueTask(task: ITaskController): void;
  removeFromQueue(taskId: string): void;
  executeImmediate<T>(fn: () => Promise<T>): Promise<T>;
  setLogLevel(level: string): void;
  disableAllLoggers(): void;
}

export interface IPollingManagerConfig {
  defaultMaxRetries?: number;
  defaultBackoffDelay?: number;
  defaultTaskTimeout?: number;
  interTaskDelay?: number;
  logLevel?: string;
  logger?: Logger;
  [key: string]: unknown;
}

export interface IPollingTaskOptions {
  id: string;
  priority?: number;
  interval: number;
  fn: (() => unknown | Promise<unknown>) | Array<() => unknown | Promise<unknown>>;
  onData?: (data: unknown[]) => void;
  onError?: (error: Error, fnIndex: number, retryCount: number) => void;
  onStart?: () => void;
  onStop?: () => void;
  onFinish?: (success: boolean, results: unknown[]) => void;
  onBeforeEach?: () => void;
  onRetry?: (error: Error, fnIndex: number, retryCount: number) => void;
  shouldRun?: () => boolean;
  onSuccess?: (result: unknown) => void;
  onFailure?: (error: Error) => void;
  name?: string;
  immediate?: boolean;
  maxRetries?: number;
  backoffDelay?: number;
  taskTimeout?: number;
}

export interface IPollingTaskState {
  stopped: boolean;
  paused: boolean;
  running: boolean;
  inProgress: boolean;
}

export interface IPollingQueueInfo {
  queueLength: number;
  tasks: Array<{
    id: string;
    state: IPollingTaskState;
  }>;
}

export interface IPollingSystemStats {
  totalTasks: number;
  totalQueues: number;
  queuedTasks: number;
}

export interface ITaskController {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  execute(): Promise<void>;
  isRunning(): boolean;
  isPaused(): boolean;
  setInterval(ms: number): void;
  getState(): IPollingTaskState;
}

// ===================================================
// TRANSPORT CONTROLLER
// ===================================================

export interface ITransportController {
  readonly sniffer: any | null;
  disableLogger(): void;
  enableLogger(): void;
  scanRtuPort(options: IScanOptions): Promise<IScanResult[]>;
  scanTcpPort(options: IScanOptions): Promise<IScanResult[]>;
  pauseScan(): void;
  resumeScan(): void;
  stopScan(): void;
  addTransport(
    id: string,
    type: TTransportType,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: IPollingManagerConfig
  ): Promise<void>;

  removeTransport(id: string): Promise<void>;
  getTransport(id: string): ITransport | null;
  listTransports(): ITransportInfo[];
  reloadTransport(
    id: string,
    options: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort })
  ): Promise<void>;

  connectAll(): Promise<void>;
  disconnectAll(): Promise<void>;

  connectTransport(id: string): Promise<void>;
  disconnectTransport(id: string): Promise<void>;

  getTransportForSlave(slaveId: number, requiredRSMode: TRSMode): ITransport | null;
  assignSlaveIdToTransport(transportId: string, slaveId: number): void;
  removeSlaveIdFromTransport(transportId: string, slaveId: number): void;

  getStatus(id?: string): ITransportStatus | Record<string, ITransportStatus>;
  getActiveTransportCount(): number;

  setDeviceStateHandler(handler: TDeviceStateHandler): void;
  setPortStateHandler(handler: TPortStateHandler): void;
  setDeviceStateHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void>;
  setPortStateHandlerForTransport(transportId: string, handler: TPortStateHandler): Promise<void>;

  addPollingTask(transportId: string, options: IPollingTaskOptions): void;
  removePollingTask(transportId: string, taskId: string): void;
  updatePollingTask(
    transportId: string,
    taskId: string,
    newOptions: Partial<IPollingTaskOptions>
  ): void;
  controlTask(
    transportId: string,
    taskId: string,
    action: 'start' | 'stop' | 'pause' | 'resume'
  ): void;
  controlPolling(
    transportId: string,
    action: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'
  ): void;
  getPollingQueueInfo(transportId: string): IPollingQueueInfo;

  executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T>;
  destroy(): Promise<void>;
}

export interface ITransportControllerOptions {
  sniffer?: boolean;
}

// ===================================================
// DEVICE/PORT STATE HANDLERS
// ===================================================

export type TDeviceStateHandler = (
  slaveId: number,
  connected: boolean,
  error?: { type: EConnectionErrorType; message: string }
) => void;

export type TPortStateHandler = (
  connected: boolean,
  slaveIds: number[],
  error?: { type: EConnectionErrorType; message: string }
) => void;

// ===================================================
// SCAN
// ===================================================

export interface IScanResult {
  type: 'node-rtu' | 'node-tcp' | 'web-rtu';
  slaveId: number;
  baudRate?: number;
  parity?: TParityType;
  port?: string | any;
  stopBits?: number;
  host?: string;
  tcpPort?: number;
}

export interface IScanController {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  readonly isPaused: boolean;
  readonly isStopped: boolean;
}

export interface IScanOptions {
  registerAddress?: number;
  path?: string | any;
  type?: 'node-rtu' | 'web-rtu';
  bauds?: number[];
  parities?: TParityType[];
  slaveIds?: number[];
  hosts?: string[];
  ports?: number[];
  unitIds?: number[];
  controller?: IScanController;
  onProgress?: (current: number, total: number, info?: any) => void;
  onDeviceFound?: (device: IScanResult) => void;
  onFinish?: (results: IScanResult[]) => void;
}

// ===================================================
// TRANSPORT OPTIONS
// ===================================================

export interface INodeSerialTransportOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: TParityType;
  readTimeout?: number;
  writeTimeout?: number;
  maxBufferSize?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  RSMode?: TRSMode;
  [key: string]: unknown;
}

export interface INodeTcpTransportOptions {
  readTimeout?: number;
  writeTimeout?: number;
  maxBufferSize?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface IWebSerialPort {
  open(options: IWebSerialPortOptions): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  readonly opened: boolean;
}

export interface IWebSerialPortOptions {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: TParityType;
  flowControl: 'none';
}

export interface IWebSerialTransportOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: TParityType;
  readTimeout?: number;
  writeTimeout?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  maxEmptyReadsBeforeReconnect?: number;
  RSMode?: TRSMode;
  [key: string]: unknown;
}

// ===================================================
// EMULATOR
// ===================================================

export type TEmulatorTypeRegister = 'Holding' | 'Input' | 'Coil' | 'Discrete';

export interface IModbusSlaveCoreEmulator {
  processRequest(unitId: number, pdu: Uint8Array): Promise<Uint8Array>;
  readCoils(startAddress: number, quantity: number): boolean[];
  readDiscreteInputs(startAddress: number, quantity: number): boolean[];
  readHoldingRegisters(startAddress: number, quantity: number): number[];
  readInputRegisters(startAddress: number, quantity: number): number[];
  writeSingleCoil(address: number, value: boolean): void;
  writeSingleRegister(address: number, value: number): void;
  addRegisters(definitions: IRegisterDefinitions): void;
  infinityChange(params: IInfinityChangeParams): void;
  stopInfinityChange(params: IStopInfinityChangeParams): void;
  setException(functionCode: number, address: number, exceptionCode: number): void;
  clearAll(): void;
}

export interface IRtuEmulatorTransportOptions {
  slaveId?: number;
  loggerEnabled?: boolean;
  initialRegisters?: any;
  responseLatencyMs?: number;
}

export interface ITcpEmulatorTransportOptions {
  slaveId?: number;
  responseLatencyMs?: number;
  loggerEnabled?: boolean;
  initialRegisters?: any;
  RSMode?: TRSMode;
}

export interface IInfinityChangeParams {
  typeRegister: TEmulatorTypeRegister;
  register: number;
  range: [number, number];
  interval: number;
}

export interface IStopInfinityChangeParams {
  typeRegister: TEmulatorTypeRegister;
  register: number;
}

export interface IRegisterDefinition {
  start: number;
  value: number | boolean;
}

export interface IRegisterDefinitions {
  coils?: IRegisterDefinition[];
  discrete?: IRegisterDefinition[];
  holding?: IRegisterDefinition[];
  input?: IRegisterDefinition[];
}
