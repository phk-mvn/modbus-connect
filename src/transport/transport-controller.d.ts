// src/transport/transport-controller.d.ts

import PollingManager from '../polling-manager.js';
import type {
  Transport,
  WebSerialPort,
  NodeSerialTransportOptions,
  WebSerialTransportOptions,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
  PollingManagerConfig,
  PollingTaskOptions,
  PollingTaskStats,
  PollingQueueInfo,
} from '../types/modbus-types.js';

// ========== Типы (Добавлен export для использования извне) ==========

export interface TransportInfo {
  id: string;
  type: 'node' | 'web' | 'node-tcp' | 'web-tcp';
  transport: Transport;
  pollingManager: PollingManager;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  slaveIds: number[];
  rsMode: RSMode;
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
  pollingStats?: {
    queueLength: number;
    tasksRunning: number;
  };
}

export type LoadBalancerStrategy = 'round-robin' | 'sticky' | 'first-available';

// Вспомогательный тип для опций с дополнительными полями, которые вычитываются через (options as any)
type TransportOptionsWithExtras<T> = T & {
  slaveIds?: number[];
  fallbacks?: string[];
};

// ========== Класс ==========

/**
 * Контроллер транспорта для управления подключениями к устройствам.
 * Также управляет задачами опроса (PollingManager) для каждого транспорта.
 */
declare class TransportController {
  constructor();

  // === Управление обработчиками (Внешние) ===
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

  // === Управление транспортами ===
  /**
   * Добавить транспорт.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта (включая slaveIds и fallbacks)
   * @param reconnectOptions - Параметры переподключения
   * @param pollingConfig - Конфигурация для PollingManager (опционально)
   */
  addTransport(
    id: string,
    type: 'node' | 'web' | 'node-tcp' | 'web-tcp',
    options:
      | TransportOptionsWithExtras<NodeSerialTransportOptions>
      | TransportOptionsWithExtras<WebSerialTransportOptions & { port: WebSerialPort }>,
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: PollingManagerConfig
  ): Promise<void>;

  /**
   * Удалить транспорт по указанному ID.
   * @param id - ID транспорта
   */
  removeTransport(id: string): Promise<void>;

  // =========================================================
  // Методы управления PollingManager (Прокси)
  // =========================================================

  /**
   * Добавляет задачу опроса в указанный транспорт.
   * @param transportId - ID транспорта
   * @param options - Опции задачи
   */
  addPollingTask(transportId: string, options: PollingTaskOptions): void;

  /**
   * Удаляет задачу опроса из указанного транспорта.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   */
  removePollingTask(transportId: string, taskId: string): void;

  /**
   * Обновляет задачу опроса.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   * @param newOptions - Новые опции
   */
  updatePollingTask(
    transportId: string,
    taskId: string,
    newOptions: Partial<PollingTaskOptions>
  ): void;

  /**
   * Управление состоянием конкретной задачи.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   * @param action - Действие (start, stop, pause, resume)
   */
  controlTask(
    transportId: string,
    taskId: string,
    action: 'start' | 'stop' | 'pause' | 'resume'
  ): void;

  /**
   * Управление всем опросом на транспорте.
   * @param transportId - ID транспорта
   * @param action - Действие (startAll, stopAll, pauseAll, resumeAll)
   */
  controlPolling(
    transportId: string,
    action: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'
  ): void;

  /**
   * Получает статистику задач для транспорта.
   * @param transportId - ID транспорта
   */
  getPollingStats(transportId: string): Record<string, PollingTaskStats>;

  /**
   * Получает информацию об очереди.
   * @param transportId - ID транспорта
   */
  getPollingQueueInfo(transportId: string): PollingQueueInfo;

  /**
   * Позволяет выполнить функцию (например, запись) с использованием мьютекса PollingManager'а транспорта.
   * Это предотвращает конфликты между опросом и ручными командами.
   * @param transportId - ID транспорта
   * @param fn - Функция для выполнения
   */
  executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Прямая запись в порт через PollingManager (для атомарности).
   * Используется для отправки команд записи Modbus.
   * @param transportId - ID транспорта
   * @param data - Данные для записи
   * @param readLength - Ожидаемая длина ответа (0 если ответ не нужен)
   * @param timeout - Таймаут операции
   */
  writeToPort(
    transportId: string,
    data: Uint8Array,
    readLength?: number,
    timeout?: number
  ): Promise<Uint8Array>;

  // =========================================================
  // Стандартные методы контроллера
  // =========================================================

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
    options:
      | TransportOptionsWithExtras<NodeSerialTransportOptions>
      | TransportOptionsWithExtras<WebSerialTransportOptions & { port: WebSerialPort }>
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
   * @param requiredRSMode - Требуемый режим работы ('RS485' или 'RS232')
   * @returns Транспорт или null, если транспорт не найден
   */
  getTransportForSlave(slaveId: number, requiredRSMode: RSMode): Transport | null;

  /**
   * Назначить slaveId транспорту. Если транспорт уже обслуживает этот slaveId — игнорирует.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): void;

  /**
   * Удаляет slaveId из транспорта.
   * Позволяет отвязать устройство, чтобы потом подключить его заново или перенести.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
   */
  removeSlaveIdFromTransport(transportId: string, slaveId: number): void;

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

  // === Управление обработчиками (Внутренние для транспорта) ===
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

export = TransportController;
