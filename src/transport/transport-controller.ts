// src/transport/transport-controller.ts

import { createTransport } from './factory.js';
import type {
  Transport,
  WebSerialPort,
  NodeSerialTransportOptions,
  WebSerialTransportOptions,
  DeviceStateHandler,
  PortStateHandler,
} from '../types/modbus-types.js';
import Logger from '../logger.js';

// ========== Типы ==========

interface TransportInfo {
  id: string;
  type: 'node' | 'web';
  transport: Transport;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  slaveIds: number[];
  fallbacks: string[]; // резервные транспорты
  createdAt: Date;
  lastError?: Error;
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
class TransportController {
  private transports: Map<string, TransportInfo> = new Map();
  private slaveTransportMap: Map<number, string[]> = new Map(); // slaveId -> [primary, fallback1, ...]
  private loadBalancerStrategy: LoadBalancerStrategy = 'first-available';
  private logger = new Logger().createLogger('TransportController');
  private diagnosticsMap: Map<string, any> = new Map(); // id -> Diagnostics

  constructor() {
    this.logger.setLevel('info');
  }

  // === Управление транспортами ===

  /**
   * Добавляет транспорт.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта
   */
  async addTransport(
    id: string,
    type: 'node' | 'web',
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort })
  ): Promise<void> {
    if (this.transports.has(id)) {
      throw new Error(`Transport with id "${id}" already exists`);
    }

    const transport = await createTransport(type, options);
    const slaveIds = (options as any).slaveIds || [];
    const fallbacks = (options as any).fallbacks || [];

    const info: TransportInfo = {
      id,
      type,
      transport,
      status: 'disconnected',
      slaveIds,
      fallbacks,
      createdAt: new Date(),
    };

    this.transports.set(id, info);

    // Устанавливаем обработчики состояния
    if (transport.setDeviceStateHandler) {
      const handler: DeviceStateHandler = (slaveId, connected, error) => {
        this.logger.debug(
          `Device ${slaveId} ${connected ? 'connected' : 'disconnected'} on ${id}`,
          error
        );
      };
      transport.setDeviceStateHandler(handler);
    }

    if (transport.setPortStateHandler) {
      const handler: PortStateHandler = (connected, slaveIds, error) => {
        this.logger.debug(`Port ${id} ${connected ? 'connected' : 'disconnected'}`, {
          slaveIds,
          error,
        });
      };
      transport.setPortStateHandler(handler);
    }

    // Обновляем slaveTransportMap
    this._updateSlaveTransportMap(id, slaveIds);

    this.logger.info(`Transport "${id}" added`, { type, slaveIds });
  }

  /**
   * Удаляет транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async removeTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) return;

    await this.disconnectTransport(id);
    this.transports.delete(id);
    this.diagnosticsMap.delete(id);

    // Обновляем slaveTransportMap
    for (const [slaveId, list] of this.slaveTransportMap.entries()) {
      const updated = list.filter(tid => tid !== id);
      if (updated.length === 0) {
        this.slaveTransportMap.delete(slaveId);
      } else {
        this.slaveTransportMap.set(slaveId, updated);
      }
    }

    this.logger.info(`Transport "${id}" removed`);
  }

  /**
   * Получает транспорт по указанному ID.
   * @param id - ID транспорта
   * @returns Транспорт или null, если транспорт не найден
   */
  getTransport(id: string): Transport | null {
    const info = this.transports.get(id);
    return info ? info.transport : null;
  }

  /**
   * Получает список всех транспортов.
   * @returns Массив объектов TransportInfo
   */
  listTransports(): TransportInfo[] {
    return Array.from(this.transports.values());
  }

  // === Подключение/отключение ===

  /**
   * Подключает все транспорты.
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.transports.values()).map(info =>
      this.connectTransport(info.id)
    );
    await Promise.all(promises);
  }

  /**
   * Отключает все транспорты.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.transports.values()).map(info =>
      this.disconnectTransport(info.id)
    );
    await Promise.all(promises);
  }

  /**
   * Подключает транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async connectTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);
    if (info.status === 'connecting' || info.status === 'connected') return;

    info.status = 'connecting';
    try {
      await info.transport.connect();
      info.status = 'connected';
      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = 'error';
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to connect transport "${id}":`, info.lastError.message);
      throw err;
    }
  }

  /**
   * Отключает транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async disconnectTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) return;

    try {
      await info.transport.disconnect();
      info.status = 'disconnected';
      this.logger.info(`Transport "${id}" disconnected`);
    } catch (err) {
      this.logger.error(`Error disconnecting transport "${id}":`, (err as Error).message);
    }
  }

  /**
   * Назначить slaveId транспорту. Если транспорт уже обслуживает этот slaveId — игнорирует.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): void {
    const info = this.transports.get(transportId);
    if (!info) {
      throw new Error(`Transport with id "${transportId}" not found`);
    }

    if (!info.slaveIds.includes(slaveId)) {
      info.slaveIds.push(slaveId);
      this._updateSlaveTransportMap(transportId, [slaveId]);
      this.logger.info(`Assigned slaveId ${slaveId} to transport "${transportId}"`);
    }
  }

  // === Маршрутизация ===

  /**
   * Установить сопоставление slaveId -> [transportId, fallback1, ...]
   * Вызывается автоматически при addTransport.
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
   * Получить транспорт для конкретного slaveId.
   * Использует стратегию балансировки или fallback.
   */
  getTransportForSlave(slaveId: number): Transport | null {
    const transportIds = this.slaveTransportMap.get(slaveId);
    if (!transportIds || transportIds.length === 0) {
      // Если нет явного сопоставления, ищем первый подходящий
      for (const [id, info] of this.transports) {
        if (info.status === 'connected') {
          return info.transport;
        }
      }
      return null;
    }

    // Стратегия: first-available
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.status === 'connected') {
        return info.transport;
      }
    }

    // Если основные не подключены — ищем резервные
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

  // === Статусы и диагностика ===

  /**
   * Получает статус транспорта по указанному ID.
   * @param id - ID транспорта
   * @returns Статус транспорта или пустой объект, если транспорт не найден
   */
  getStatus(id?: string): TransportStatus | Record<string, TransportStatus> {
    if (id) {
      const info = this.transports.get(id);
      if (!info) return {} as TransportStatus;
      return {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: 0, // пока не реализовано
      };
    }

    const result: Record<string, TransportStatus> = {};
    for (const [tid, info] of this.transports) {
      result[tid] = {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: 0,
      };
    }
    return result;
  }

  /**
   * Получает диагностику транспорта по указанному ID.
   * @param id - ID транспорта
   * @returns Диагностика транспорта или null, если транспорт не найден
   */
  getStats(id?: string) {
    if (id) {
      return this.diagnosticsMap.get(id) || null;
    }
    const result: Record<string, any> = {};
    for (const [tid] of this.transports) {
      result[tid] = this.diagnosticsMap.get(tid) || null;
    }
    return result;
  }

  /**
   * Получает количество активных транспортов.
   * @returns Количество активных транспортов
   */
  getActiveTransportCount(): number {
    let count = 0;
    for (const info of this.transports.values()) {
      if (info.status === 'connected') count++;
    }
    return count;
  }

  // === Балансировка ===

  /**
   * Устанавливает стратегию балансировки.
   * @param strategy - Стратегия балансировки ('round-robin', 'sticky', 'first-available')
   */
  setLoadBalancer(strategy: LoadBalancerStrategy): void {
    this.loadBalancerStrategy = strategy;
  }

  // === Уведомления (заглушка) ===

  // TODO: добавить EventEmitter или Observable для onTransportStatusChange, onTransportError

  // === Уничтожение ===

  /**
   * Уничтожает контроллер транспорта.
   */
  async destroy(): Promise<void> {
    await this.disconnectAll();
    this.transports.clear();
    this.slaveTransportMap.clear();
    this.diagnosticsMap.clear();
    this.logger.info('TransportController destroyed');
  }
}

export = TransportController;
