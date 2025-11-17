// src/transport/transport-controller.d.ts

import type {
  Transport,
  WebSerialPort,
  NodeSerialTransportOptions,
  WebSerialTransportOptions,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
} from '../types/modbus-types.js';

// ========== Типы ==========

interface TransportInfo {
  id: string;
  type: 'node' | 'web';
  transport: Transport;
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

interface TransportStatus {
  id: string;
  connected: boolean;
  lastError?: Error;
  connectedSlaveIds: number[];
  uptime: number;
  reconnectAttempts: number;
}

type LoadBalancerStrategy = 'round-robin' | 'sticky' | 'first-available';

// ========== Класс ==========

/**
 * Контроллер транспорта для управления подключениями к устройствам.
 */
declare class TransportController {
  constructor();

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

export = TransportController;
