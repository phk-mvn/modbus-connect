// src/types/modbus-types.ts

import { RegisterType } from '../constants/constants.js';

// !=============================================================================
// ! Типы для функций чтения Modbus
// !=============================================================================

export type ReadCoilsResponse = boolean[];

export type ReadDiscreteInputsResponse = boolean[];

export type ReadHoldingRegistersResponse = number[];

export type ReadInputRegistersResponse = number[];

// !=============================================================================
// ! Типы для функций записи Modbus
// !=============================================================================

/** Ответ на запрос записи одного coil */
export interface WriteSingleCoilResponse {
  address: number;
  value: boolean;
}

/** Ответ на запрос записи нескольких coil */
export interface WriteMultipleCoilsResponse {
  startAddress: number;
  quantity: number;
}

/** Ответ на запрос записи одного регистра */
export interface WriteSingleRegisterResponse {
  address: number;
  value: number;
}

/** Ответ на запрос записи нескольких регистров */
export interface WriteMultipleRegistersResponse {
  startAddress: number;
  quantity: number;
}

// !=============================================================================
// ! Типы для специальных функций Modbus
// !=============================================================================

/** Ответ на запрос идентификации устройства (Report Slave ID) */
export interface ReportSlaveIdResponse {
  slaveId: number;
  isRunning: boolean;
  data: Uint8Array;
}

/** Ответ на запрос идентификатора устройства (Read Device Identification) */
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

// !=============================================================================
// ! Типы для функций SGM130
// !=============================================================================

/** Ответ на запрос длины файла */
export type ReadFileLengthResponse = number;

/** Ответ на запрос открытия файла */
export interface OpenFileResponse {
  fileLength: number;
}

/** Ответ на запрос закрытия файла */
export type CloseFileResponse = boolean;

/** Ответ на запрос перезапуска контроллера */
export interface RestartControllerResponse {
  success: boolean;
  warning?: string;
}

/** Ответ на запрос получения времени контроллера */
export interface GetControllerTimeResponse {
  seconds: number;
  minutes: number;
  hours: number;
  day: number;
  month: number;
  year: number;
}

/** Структура для представления времени контроллера */
export interface ControllerTime {
  seconds: number;
  minutes: number;
  hours: number;
  day: number;
  month: number;
  year: number;
}

/** Ответ на запрос установки времени контроллера */
export type SetControllerTimeResponse = boolean;

// !=============================================================================
// ! Интерфейсы для транспорта
// !=============================================================================
export type RSMode = 'RS485' | 'RS232';

export type PortStateHandler = (
  connected: boolean,
  slaveIds?: number[],
  error?: { type: ConnectionErrorType; message: string }
) => void;

/** Состояние подключения устройства */
export interface DeviceConnectionStateObject {
  slaveId: number;
  hasConnectionDevice: boolean;
  errorType?: string;
  errorMessage?: string;
}

/** Обработчик изменения состояния подключения устройства */
export type DeviceStateHandler = (
  slaveId: number,
  connected: boolean,
  error?: { type: string; message: string }
) => void;

/** Интерфейс для транспорта Modbus */
export interface Transport {
  readonly isOpen: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush?(): Promise<void>;
  getRSMode(): RSMode;

  /**
   * Установить обработчик состояния подключения устройства.
   */
  setDeviceStateHandler(handler: DeviceStateHandler): void;

  /**
   * Установить обработчик состояния физического порта.
   */
  setPortStateHandler(handler: PortStateHandler): void;

  /**
   * Отключить уведомления о состоянии устройств.
   * После вызова `setDeviceStateHandler` перестанет работать.
   */
  disableDeviceTracking(): Promise<void>;

  /**
   * Включить трекинг устройств (если был отключён).
   * @param handler Опционально: установить новый обработчик
   */
  enableDeviceTracking(handler?: DeviceStateHandler): Promise<void>;

  notifyDeviceConnected?(slaveId: number): void;
  notifyDeviceDisconnected?(
    slaveId: number,
    errorType: ConnectionErrorType,
    errorMessage?: string
  ): void;
}

export interface DeviceConnectionTracker {
  setHandler(handler: DeviceStateHandler): Promise<void>;
  removeHandler(): Promise<void>;
  clearHandler(): Promise<void>;
}

/**
 * Типы ошибок подключения
 */
export enum ConnectionErrorType {
  UnknownError = 'UnknownError',
  PortClosed = 'PortClosed',
  Timeout = 'Timeout',
  CRCError = 'CRCError',
  ConnectionLost = 'ConnectionLost',
  DeviceOffline = 'DeviceOffline',
  MaxReconnect = 'MaxReconnect',
  ManualDisconnect = 'ManualDisconnect',
  Destroyed = 'Destroyed',
}

export interface DeviceConnectionTrackerOptions {
  /** Интервал дебонса уведомлений об отключении (мс) */
  debounceMs?: number;
  /** Валидировать slaveId (0–247) */
  validateSlaveId?: boolean;
}

// !=============================================================================
// ! Интерфейс для TransportController
// !=============================================================================

export interface TransportControllerInterface {
  // === Управление транспортами ===
  /**
   * Добавить транспорт.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта
   * @param reconnectOptions - Параметры переподключения
   */
  addTransport(
    id: string,
    type: 'node' | 'web',
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    }
  ): Promise<void>;

  /**
   * Удалить транспорт по указанному ID.
   * @param id - ID транспорта
   */
  removeTransport(id: string): Promise<void>;

  /**
   * Получить транспорт по указанному ID.
   * @param id - ID транспорта
   * @returns Транспорт или null, если транспорт не найден
   */
  getTransport(id: string): Transport | null;

  /**
   * Получить список всех транспортов.
   * @returns Массив объектов TransportInfo
   */
  listTransports(): TransportInfo[];

  /**
   * Перезагрузить транспорт с новыми опциями.
   * @param id - ID транспорта
   * @param options - Новые опции
   */
  reloadTransport(
    id: string,
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort })
  ): Promise<void>;

  // === Подключение/отключение ===
  /**
   * Подключить все транспорты.
   */
  connectAll(): Promise<void>;

  /**
   * Отключить все транспорты.
   */
  disconnectAll(): Promise<void>;

  /**
   * Подключить транспорт по указанному ID.
   * @param id - ID транспорта
   */
  connectTransport(id: string): Promise<void>;

  /**
   * Отключить транспорт по указанному ID.
   * @param id - ID транспорта
   */
  disconnectTransport(id: string): Promise<void>;

  // === Маршрутизация ===
  /**
   * Получить транспорт для конкретного slaveId.
   * @param slaveId - ID устройства
   * @returns Транспорт или null, если транспорт не найден
   */
  getTransportForSlave(slaveId: number, requiredRSMode: RSMode): Transport | null;

  /**
   * Назначить slaveId транспорту. Если транспорт уже обслуживает этот slaveId — игнорирует.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): void;

  // === Статусы и диагностика ===
  /**
   * Получить статус транспорта.
   * @param id - ID транспорта (по умолчанию все транспорты)
   * @returns Статус транспорта или объект со статусами всех транспортов
   */
  getStatus(id?: string): TransportStatus | Record<string, TransportStatus>;

  /**
   * Получить количество активных транспортов.
   * @returns Количество активных транспортов
   */
  getActiveTransportCount(): number;

  // === Балансировка ===
  /**
   * Установить стратегию балансировки.
   * @param strategy - Стратегия балансировки ('round-robin', 'sticky', 'first-available')
   */
  setLoadBalancer(strategy: LoadBalancerStrategy): void;

  // === Управление обработчиками ===
  /**
   * Установить обработчик состояния устройства для внешнего мира.
   * @param handler - Обработчик состояния
   */
  setDeviceStateHandler(handler: DeviceStateHandler): void;

  /**
   * Установить обработчик состояния порта для внешнего мира.
   * @param handler - Обработчик состояния
   */
  setPortStateHandler(handler: PortStateHandler): void;

  /**
   * Установить обработчик состояния устройства для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
   */
  setDeviceStateHandlerForTransport(
    transportId: string,
    handler: DeviceStateHandler
  ): Promise<void>;

  /**
   * Установить обработчик состояния порта для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
   */
  setPortStateHandlerForTransport(transportId: string, handler: PortStateHandler): Promise<void>;

  // === Уничтожение ===
  /**
   * Уничтожить транспорт.
   */
  destroy(): Promise<void>;
}

// --- Типы, используемые в TransportControllerInterface ---
export interface TransportInfo {
  id: string;
  type: 'node' | 'web';
  transport: Transport;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  slaveIds: number[];
  fallbacks: string[];
  createdAt: Date;
  lastError?: Error;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
}

export interface TransportStatus {
  id: string;
  connected: boolean;
  lastError?: Error;
  connectedSlaveIds: number[];
  uptime: number;
  reconnectAttempts: number;
}

export type LoadBalancerStrategy = 'round-robin' | 'sticky' | 'first-available';

// !=============================================================================
// ! Интерфейсы для опций клиента
// !=============================================================================

/** Опции для конфигурации Modbus клиента */
export interface ModbusClientOptions {
  RSMode?: RSMode;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  echoEnabled?: boolean;
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

// !=============================================================================
// ! Типы для логгера
// !=============================================================================

/** Уровни логирования */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/** Контекст для логирования */
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

/** Интерфейс для экземпляра логгера */
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

// !=============================================================================
// ! Интерфейсы для транспорта через последовательный порт
// !=============================================================================
/** Опции для транспорта через Node.js SerialPort */
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
  RSMode?: RSMode;
  [key: string]: unknown;
}

/** Интерфейс для Web Serial Port */
export interface WebSerialPort {
  open(options: WebSerialPortOptions): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  readonly opened: boolean;
}

/** Опции для Web Serial Port */
export interface WebSerialPortOptions {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
  flowControl: 'none';
}

/** Опции для транспорта через Web Serial */
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
  RSMode?: RSMode;
  [key: string]: unknown;
}

// !=============================================================================
// ! Типы для системы опроса (Polling)
// !=============================================================================

/** Конфигурация менеджера опроса */
export interface PollingManagerConfig {
  defaultMaxRetries?: number;
  defaultBackoffDelay?: number;
  defaultTaskTimeout?: number;
  logLevel?: LogLevel;
  [key: string]: unknown;
}

/** Опции для задачи опроса */
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

/** Состояние задачи опроса */
export interface PollingTaskState {
  stopped: boolean;
  paused: boolean;
  running: boolean;
  inProgress: boolean;
}

/** Статистика задачи опроса */
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

/** Информация о очереди опроса */
export interface PollingQueueInfo {
  resourceId: string;
  queueLength: number;
  tasks: Array<{
    id: string;
    state: PollingTaskState;
  }>;
}

/** Статистика системы опроса */
export interface PollingSystemStats {
  totalTasks: number;
  totalQueues: number;
  queuedTasks: number;
  tasks: Record<string, PollingTaskStats>;
}

// !=============================================================================
// ! Типы для эмулятора и регистров
// !=============================================================================

/** Определение одного регистра */
export interface RegisterDefinition {
  start: number;
  value: number | boolean;
}

/** Определения наборов регистров */
export interface RegisterDefinitions {
  coils?: RegisterDefinition[];
  discrete?: RegisterDefinition[];
  holding?: RegisterDefinition[];
  input?: RegisterDefinition[];
}

/** Параметры для бесконечного изменения регистра */
export interface InfinityChangeParams {
  typeRegister: 'Holding' | 'Input' | 'Coil' | 'Discrete';
  register: number;
  range: [number, number];
  interval: number;
}

/** Параметры для остановки бесконечного изменения регистра */
export interface StopInfinityChangeParams {
  typeRegister: 'Holding' | 'Input' | 'Coil' | 'Discrete';
  register: number;
}

/** Опции для эмулятора slave-устройства */
export interface SlaveEmulatorOptions {
  loggerEnabled?: boolean;
}

/** Тип для конвертированных регистров с поддержкой различных типов данных */
export type ConvertedRegisters<T extends RegisterType = RegisterType.UINT16> = T extends
  | RegisterType.UINT16
  | RegisterType.INT16
  | RegisterType.UINT32
  | RegisterType.INT32
  | RegisterType.FLOAT
  ? number[]
  : T extends RegisterType.UINT64 | RegisterType.INT64
    ? bigint[]
    : T extends RegisterType.DOUBLE
      ? number[]
      : T extends RegisterType.UINT32_LE | RegisterType.INT32_LE | RegisterType.FLOAT_LE
        ? number[]
        : T extends
              | RegisterType.UINT32_SW
              | RegisterType.INT32_SW
              | RegisterType.FLOAT_SW
              | RegisterType.UINT32_SB
              | RegisterType.INT32_SB
              | RegisterType.FLOAT_SB
              | RegisterType.UINT32_SBW
              | RegisterType.INT32_SBW
              | RegisterType.FLOAT_SBW
              | RegisterType.UINT32_LE_SW
              | RegisterType.INT32_LE_SW
              | RegisterType.FLOAT_LE_SW
              | RegisterType.UINT32_LE_SB
              | RegisterType.INT32_LE_SB
              | RegisterType.FLOAT_LE_SB
              | RegisterType.UINT32_LE_SBW
              | RegisterType.INT32_LE_SBW
              | RegisterType.FLOAT_LE_SBW
          ? number[]
          : T extends RegisterType.UINT64_LE | RegisterType.INT64_LE
            ? bigint[]
            : T extends RegisterType.DOUBLE_LE
              ? number[]
              : T extends RegisterType.HEX
                ? string[]
                : T extends RegisterType.STRING
                  ? string[]
                  : T extends RegisterType.BOOL
                    ? boolean[]
                    : T extends RegisterType.BINARY
                      ? boolean[][]
                      : T extends RegisterType.BCD
                        ? number[]
                        : never;

/** Опции для конвертации регистров */
export interface ConvertRegisterOptions {
  type?: RegisterType;
}
