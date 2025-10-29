"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_factory = require("./factory.js");
var import_logger = __toESM(require("../logger.js"));
class TransportController {
  transports = /* @__PURE__ */ new Map();
  slaveTransportMap = /* @__PURE__ */ new Map();
  // slaveId -> [primary, fallback1, ...]
  loadBalancerStrategy = "first-available";
  logger = new import_logger.default().createLogger("TransportController");
  diagnosticsMap = /* @__PURE__ */ new Map();
  // id -> Diagnostics
  constructor() {
    this.logger.setLevel("info");
  }
  // === Управление транспортами ===
  /**
   * Добавляет транспорт.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта
   */
  async addTransport(id, type, options) {
    if (this.transports.has(id)) {
      throw new Error(`Transport with id "${id}" already exists`);
    }
    const transport = await (0, import_factory.createTransport)(type, options);
    const slaveIds = options.slaveIds || [];
    const fallbacks = options.fallbacks || [];
    const info = {
      id,
      type,
      transport,
      status: "disconnected",
      slaveIds,
      fallbacks,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.transports.set(id, info);
    if (transport.setDeviceStateHandler) {
      const handler = (slaveId, connected, error) => {
        this.logger.debug(
          `Device ${slaveId} ${connected ? "connected" : "disconnected"} on ${id}`,
          error
        );
      };
      transport.setDeviceStateHandler(handler);
    }
    if (transport.setPortStateHandler) {
      const handler = (connected, slaveIds2, error) => {
        this.logger.debug(`Port ${id} ${connected ? "connected" : "disconnected"}`, {
          slaveIds: slaveIds2,
          error
        });
      };
      transport.setPortStateHandler(handler);
    }
    this._updateSlaveTransportMap(id, slaveIds);
    this.logger.info(`Transport "${id}" added`, { type, slaveIds });
  }
  /**
   * Удаляет транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async removeTransport(id) {
    const info = this.transports.get(id);
    if (!info) return;
    await this.disconnectTransport(id);
    this.transports.delete(id);
    this.diagnosticsMap.delete(id);
    for (const [slaveId, list] of this.slaveTransportMap.entries()) {
      const updated = list.filter((tid) => tid !== id);
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
  getTransport(id) {
    const info = this.transports.get(id);
    return info ? info.transport : null;
  }
  /**
   * Получает список всех транспортов.
   * @returns Массив объектов TransportInfo
   */
  listTransports() {
    return Array.from(this.transports.values());
  }
  // === Подключение/отключение ===
  /**
   * Подключает все транспорты.
   */
  async connectAll() {
    const promises = Array.from(this.transports.values()).map(
      (info) => this.connectTransport(info.id)
    );
    await Promise.all(promises);
  }
  /**
   * Отключает все транспорты.
   */
  async disconnectAll() {
    const promises = Array.from(this.transports.values()).map(
      (info) => this.disconnectTransport(info.id)
    );
    await Promise.all(promises);
  }
  /**
   * Подключает транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async connectTransport(id) {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);
    if (info.status === "connecting" || info.status === "connected") return;
    info.status = "connecting";
    try {
      await info.transport.connect();
      info.status = "connected";
      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = "error";
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to connect transport "${id}":`, info.lastError.message);
      throw err;
    }
  }
  /**
   * Отключает транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async disconnectTransport(id) {
    const info = this.transports.get(id);
    if (!info) return;
    try {
      await info.transport.disconnect();
      info.status = "disconnected";
      this.logger.info(`Transport "${id}" disconnected`);
    } catch (err) {
      this.logger.error(`Error disconnecting transport "${id}":`, err.message);
    }
  }
  /**
   * Назначить slaveId транспорту. Если транспорт уже обслуживает этот slaveId — игнорирует.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
   */
  assignSlaveIdToTransport(transportId, slaveId) {
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
   * Получить транспорт для конкретного slaveId.
   * Использует стратегию балансировки или fallback.
   */
  getTransportForSlave(slaveId) {
    const transportIds = this.slaveTransportMap.get(slaveId);
    if (!transportIds || transportIds.length === 0) {
      for (const [id, info] of this.transports) {
        if (info.status === "connected") {
          return info.transport;
        }
      }
      return null;
    }
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.status === "connected") {
        return info.transport;
      }
    }
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.fallbacks) {
        for (const fallbackId of info.fallbacks) {
          const fallbackInfo = this.transports.get(fallbackId);
          if (fallbackInfo && fallbackInfo.status === "connected") {
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
  getStatus(id) {
    if (id) {
      const info = this.transports.get(id);
      if (!info) return {};
      return {
        id: info.id,
        connected: info.status === "connected",
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: 0
        // пока не реализовано
      };
    }
    const result = {};
    for (const [tid, info] of this.transports) {
      result[tid] = {
        id: info.id,
        connected: info.status === "connected",
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: 0
      };
    }
    return result;
  }
  /**
   * Получает диагностику транспорта по указанному ID.
   * @param id - ID транспорта
   * @returns Диагностика транспорта или null, если транспорт не найден
   */
  getStats(id) {
    if (id) {
      return this.diagnosticsMap.get(id) || null;
    }
    const result = {};
    for (const [tid] of this.transports) {
      result[tid] = this.diagnosticsMap.get(tid) || null;
    }
    return result;
  }
  /**
   * Получает количество активных транспортов.
   * @returns Количество активных транспортов
   */
  getActiveTransportCount() {
    let count = 0;
    for (const info of this.transports.values()) {
      if (info.status === "connected") count++;
    }
    return count;
  }
  // === Балансировка ===
  /**
   * Устанавливает стратегию балансировки.
   * @param strategy - Стратегия балансировки ('round-robin', 'sticky', 'first-available')
   */
  setLoadBalancer(strategy) {
    this.loadBalancerStrategy = strategy;
  }
  // === Уведомления (заглушка) ===
  // TODO: добавить EventEmitter или Observable для onTransportStatusChange, onTransportError
  // === Уничтожение ===
  /**
   * Уничтожает контроллер транспорта.
   */
  async destroy() {
    await this.disconnectAll();
    this.transports.clear();
    this.slaveTransportMap.clear();
    this.diagnosticsMap.clear();
    this.logger.info("TransportController destroyed");
  }
}
module.exports = TransportController;
