// src/types/modbus-types.ts

// Типы для функций чтения
export type ReadCoilsResponse = boolean[];
export type ReadDiscreteInputsResponse = boolean[];
export type ReadHoldingRegistersResponse = number[];
export type ReadInputRegistersResponse = number[];

// Типы для функций записи
export interface WriteSingleCoilResponse {
  address: number;
  value: boolean;
}

export interface WriteMultipleCoilsResponse {
  startAddress: number;
  quantity: number;
}

export interface WriteSingleRegisterResponse {
  address: number;
  value: number;
}

export interface WriteMultipleRegistersResponse {
  startAddress: number;
  quantity: number;
}

// Типы для специальных функций
export interface ReportSlaveIdResponse {
  slaveId: number;
  isRunning: boolean;
  data: Uint8Array;
}

export interface ReadDeviceIdentificationResponse {
  functionCode: number;
  meiType: number;
  category: number;
  conformityLevel: number;
  moreFollows: number;
  nextObjectId: number;
  numberOfObjects: number;
  objects: Record<number, string>;
}

// Типы для функций SGM130
export type ReadFileLengthResponse = number;

export interface OpenFileResponse {
  fileLength: number;
}

export type CloseFileResponse = boolean;

export interface RestartControllerResponse {
  success: boolean;
  warning?: string;
}

export interface GetControllerTimeResponse {
  seconds: number;
  minutes: number;
  hours: number;
  day: number;
  month: number;
  year: number;
}

export interface ControllerTime {
  seconds: number;
  minutes: number;
  hours: number;
  day: number;
  month: number;
  year: number;
}

export type SetControllerTimeResponse = boolean;

// Типы для преобразованных регистров
export type ConvertedRegisters =
  | number[] // uint16, int16
  | number[] // uint32, int32, float, uint32_le, int32_le, float_le и т.д.
  | bigint[] // uint64, int64
  | number[] // double
  | string[] // hex, string, bcd
  | boolean[] // bool
  | boolean[][]; // binary

// Интерфейсы для транспорта
export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush?(): Promise<void>;
}

// Интерфейсы для опций
export interface ModbusClientOptions {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  echoEnabled?: boolean;
  diagnostics?: boolean;
  crcAlgorithm?:
    | 'crc16Modbus'
    | 'crc16CcittFalse'
    | 'crc32'
    | 'crc8'
    | 'crc1'
    | 'crc8_1wire'
    | 'crc8_dvbs2'
    | 'crc16_kermit'
    | 'crc16_xmodem'
    | 'crc24'
    | 'crc32mpeg'
    | 'crcjam';
}

export interface ConvertRegisterOptions {
  type?: string;
}

// Типы для логгера
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  slaveId?: number;
  funcCode?: number;
  exceptionCode?: number;
  address?: number;
  quantity?: number;
  responseTime?: number;
  logger?: string;
  transport?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface LoggerInstance {
  trace(...args: unknown[]): Promise<void>;
  debug(...args: unknown[]): Promise<void>;
  info(...args: unknown[]): Promise<void>;
  warn(...args: unknown[]): Promise<void>;
  error(...args: unknown[]): Promise<void>;
  group(): void;
  groupCollapsed(): void;
  groupEnd(): void;
  setLevel(lvl: LogLevel): void;
  pause(): void;
  resume(): void;
}

// Типы для диагностики
export interface DiagnosticsOptions {
  notificationThreshold?: number;
  errorRateThreshold?: number;
  slaveId?: number | number[];
  loggerName?: string;
}

export interface DiagnosticsStats {
  uptimeSeconds: number;
  totalSessions: number;
  totalRequests: number;
  successfulResponses: number;
  errorResponses: number;
  timeouts: number;
  crcErrors: number;
  modbusExceptions: number;
  exceptionCodeCounts: Record<string, number>;
  totalRetries: number;
  totalRetrySuccesses: number;
  lastResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  averageResponseTime: number | null;
  averageResponseTimeAll: number | null;
  requestsPerSecond: number | null;
  errorRate: number | null;
  lastErrorMessage: string | null;
  lastErrors: string[];
  lastSuccessDetails: {
    responseTime: number;
    timestamp: string;
    funcCode: number | null;
    slaveId: number;
  } | null;
  functionCallCounts: Record<string, number>;
  commonErrors: { message: string; count: number }[];
  dataSent: number;
  dataReceived: number;
  lastRequestTimestamp: string | null;
  lastSuccessTimestamp: string | null;
  lastErrorTimestamp: string | null;
  slaveIds: number[];
}

export interface AnalysisResult {
  warnings: string[];
  isHealthy: boolean;
  stats: DiagnosticsStats;
}

export interface DiagnosticsInterface {
  recordRequest(slaveId?: number, funcCode?: number): void;
  recordFunctionCall(funcCode: number, slaveId?: number): void;
  recordDataSent(byteLength: number, slaveId?: number, funcCode?: number): void;
  recordDataReceived(byteLength: number, slaveId?: number, funcCode?: number): void;
  recordSuccess(responseTimeMs: number, slaveId?: number, funcCode?: number): void;
  recordError(
    error: Error,
    options?: {
      code?: string | null;
      responseTimeMs?: number;
      exceptionCode?: number | null;
      slaveId?: number;
      funcCode?: number;
    }
  ): void;
  recordRetry(attempts: number, slaveId?: number, funcCode?: number): void;
  recordRetrySuccess(slaveId?: number, funcCode?: number): void;
  getStats(): DiagnosticsStats;
  reset(): void;
  resetStats(metrics?: string[]): void;
  destroy(): void;
  analyze(): AnalysisResult;
  printStats(): void;
  serialize(): string;
  toTable(): { metric: string; value: unknown }[];
  mergeWith(other: DiagnosticsInterface): void;
  readonly averageResponseTime: number | null;
  readonly averageResponseTimeAll: number | null;
  readonly errorRate: number | null;
  readonly requestsPerSecond: number | null;
  readonly uptimeSeconds: number;
}

export interface NodeSerialTransportOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
  readTimeout?: number;
  writeTimeout?: number;
  maxBufferSize?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  [key: string]: unknown;
}

export interface WebSerialPort {
  open(options: WebSerialPortOptions): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  readonly opened: boolean;
}

export interface WebSerialPortOptions {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
  flowControl: 'none';
}

export interface WebSerialTransportOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
  readTimeout?: number;
  writeTimeout?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  maxEmptyReadsBeforeReconnect?: number;
  [key: string]: unknown;
}

export interface PollingManagerConfig {
  defaultMaxRetries?: number;
  defaultBackoffDelay?: number;
  defaultTaskTimeout?: number;
  logLevel?: LogLevel;
  [key: string]: unknown;
}

export interface PollingTaskOptions {
  id: string;
  resourceId?: string;
  priority?: number;
  interval: number;
  fn: (() => Promise<unknown>) | Array<() => Promise<unknown>>;
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

export interface PollingTaskState {
  stopped: boolean;
  paused: boolean;
  running: boolean;
  inProgress: boolean;
}

export interface PollingTaskStats {
  totalRuns: number;
  totalErrors: number;
  lastError: Error | null;
  lastResult: unknown;
  lastRunTime: number | null;
  retries: number;
  successes: number;
  failures: number;
}

export interface PollingQueueInfo {
  resourceId: string;
  queueLength: number;
  tasks: Array<{
    id: string;
    state: PollingTaskState;
  }>;
}

export interface PollingSystemStats {
  totalTasks: number;
  totalQueues: number;
  queuedTasks: number;
  tasks: Record<string, PollingTaskStats>;
}

export interface RegisterDefinition {
  start: number;
  value: number | boolean;
}

export interface RegisterDefinitions {
  coils?: RegisterDefinition[];
  discrete?: RegisterDefinition[];
  holding?: RegisterDefinition[];
  input?: RegisterDefinition[];
}

export interface InfinityChangeParams {
  typeRegister: 'Holding' | 'Input' | 'Coil' | 'Discrete';
  register: number;
  range: [number, number];
  interval: number;
}

export interface StopInfinityChangeParams {
  typeRegister: 'Holding' | 'Input' | 'Coil' | 'Discrete';
  register: number;
}

export interface SlaveEmulatorOptions {
  loggerEnabled?: boolean;
}
