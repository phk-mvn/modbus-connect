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
var import_modbus_types = require("../types/modbus-types.js");
var import_logger = __toESM(require("../logger.js"));
var import_DeviceConnectionTracker = require("./trackers/DeviceConnectionTracker.js");
var import_PortConnectionTracker = require("./trackers/PortConnectionTracker.js");
class TransportController {
  transports = /* @__PURE__ */ new Map();
  slaveTransportMap = /* @__PURE__ */ new Map();
  loadBalancerStrategy = "first-available";
  logger = new import_logger.default().createLogger("TransportController");
  _roundRobinIndex = 0;
  _stickyMap = /* @__PURE__ */ new Map();
  transportToDeviceTrackerMap = /* @__PURE__ */ new Map();
  transportToPortTrackerMap = /* @__PURE__ */ new Map();
  transportToDeviceHandlerMap = /* @__PURE__ */ new Map();
  transportToPortHandlerMap = /* @__PURE__ */ new Map();
  _externalDeviceStateHandler = null;
  _externalPortStateHandler = null;
  constructor() {
    this.logger.setLevel("info");
  }
  /**
   * Устанавливает обработчик состояния устройства для внешнего мира.
   * @param handler - Обработчик состояния
   */
  setDeviceStateHandler(handler) {
    this._externalDeviceStateHandler = handler;
  }
  /**
   * Устанавливает обработчик состояния порта для внешнего мира.
   * @param handler - Обработчик состояния
   */
  setPortStateHandler(handler) {
    this._externalPortStateHandler = handler;
  }
  /**
   * Добавляет транспорт.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта
   * @param reconnectOptions - Параметры переподключения
   */
  async addTransport(id, type, options, reconnectOptions) {
    if (this.transports.has(id)) {
      throw new Error(`Transport with id "${id}" already exists`);
    }
    let transport;
    try {
      switch (type) {
        case "node": {
          const path = options.port || options.path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }
          const NodeSerialTransport = (await import("./node-transports/node-serialport.js")).default;
          const nodeOptions = {};
          const allowedNodeKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "maxBufferSize",
            "reconnectInterval",
            "maxReconnectAttempts"
          ];
          for (const key of allowedNodeKeys) {
            if (key in options) {
              nodeOptions[key] = options[key];
            }
          }
          transport = new NodeSerialTransport(path, nodeOptions);
          break;
        }
        case "web": {
          const port = options.port;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }
          const WebSerialTransport = (await import("./web-transports/web-serialport.js")).default;
          const portFactory = async () => {
            this.logger.debug("WebSerialTransport portFactory: Returning provided port instance");
            try {
              if (port.readable || port.writable) {
                this.logger.debug(
                  "WebSerialTransport portFactory: Port seems to be in use, trying to close..."
                );
                try {
                  await port.close();
                  this.logger.debug("WebSerialTransport portFactory: Existing port closed");
                } catch (closeErr) {
                  this.logger.warn(
                    "WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):",
                    closeErr.message
                  );
                }
              }
            } catch (err) {
              this.logger.error(
                "WebSerialTransport portFactory: Failed to prepare existing port for reuse:",
                err
              );
            }
            return port;
          };
          const webOptions = {};
          const allowedWebKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "reconnectInterval",
            "maxReconnectAttempts",
            "maxEmptyReadsBeforeReconnect"
          ];
          for (const key of allowedWebKeys) {
            if (key in options) {
              webOptions[key] = options[key];
            }
          }
          this.logger.debug("Creating WebSerialTransport with provided port");
          transport = new WebSerialTransport(portFactory, webOptions);
          break;
        }
        default:
          throw new Error(`Unknown transport type: ${type}`);
      }
    } catch (err) {
      this.logger.error(`Failed to create transport of type "${type}": ${err.message}`);
      throw err;
    }
    const slaveIds = options.slaveIds || [];
    const fallbacks = options.fallbacks || [];
    const info = {
      id,
      type,
      transport,
      status: "disconnected",
      slaveIds,
      fallbacks,
      createdAt: /* @__PURE__ */ new Date(),
      reconnectAttempts: 0,
      maxReconnectAttempts: reconnectOptions?.maxReconnectAttempts ?? 5,
      reconnectInterval: reconnectOptions?.reconnectInterval ?? 2e3
    };
    this.transports.set(id, info);
    const deviceTracker = new import_DeviceConnectionTracker.DeviceConnectionTracker();
    const portTracker = new import_PortConnectionTracker.PortConnectionTracker();
    this.transportToDeviceTrackerMap.set(id, deviceTracker);
    this.transportToPortTrackerMap.set(id, portTracker);
    transport.setDeviceStateHandler((slaveId, connected, error) => {
      this._onDeviceStateChange(id, slaveId, connected, error);
    });
    transport.setPortStateHandler((connected, slaveIds2, error) => {
      this._onPortStateChange(id, connected, slaveIds2, error);
    });
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
    this.transportToDeviceTrackerMap.delete(id);
    this.transportToPortTrackerMap.delete(id);
    this.transportToDeviceHandlerMap.delete(id);
    this.transportToPortHandlerMap.delete(id);
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
      info.reconnectAttempts = 0;
      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = "error";
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to connect transport "${id}":`, info.lastError.message);
      if (info.reconnectAttempts < info.maxReconnectAttempts) {
        info.reconnectAttempts++;
        setTimeout(
          () => this.connectTransport(id),
          info.reconnectInterval * info.reconnectAttempts
        );
      } else {
        this.logger.error(`Max reconnection attempts reached for "${id}"`);
      }
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
  /**
   * Перезагружает транспорт с новыми опциями.
   * @param id - ID транспорта
   * @param options - Новые опции
   */
  async reloadTransport(id, options) {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);
    const wasConnected = info.status === "connected";
    await this.disconnectTransport(id);
    let newTransport;
    try {
      switch (info.type) {
        case "node": {
          const path = options.port || options.path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }
          const NodeSerialTransport = (await import("./node-transports/node-serialport.js")).default;
          const nodeOptions = {};
          const allowedNodeKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "maxBufferSize",
            "reconnectInterval",
            "maxReconnectAttempts"
          ];
          for (const key of allowedNodeKeys) {
            if (key in options) {
              nodeOptions[key] = options[key];
            }
          }
          newTransport = new NodeSerialTransport(path, nodeOptions);
          break;
        }
        case "web": {
          const port = options.port;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }
          const WebSerialTransport = (await import("./web-transports/web-serialport.js")).default;
          const portFactory = async () => {
            this.logger.debug("WebSerialTransport portFactory: Returning provided port instance");
            try {
              if (port.readable || port.writable) {
                this.logger.debug(
                  "WebSerialTransport portFactory: Port seems to be in use, trying to close..."
                );
                try {
                  await port.close();
                  this.logger.debug("WebSerialTransport portFactory: Existing port closed");
                } catch (closeErr) {
                  this.logger.warn(
                    "WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):",
                    closeErr.message
                  );
                }
              }
            } catch (err) {
              this.logger.error(
                "WebSerialTransport portFactory: Failed to prepare existing port for reuse:",
                err
              );
            }
            return port;
          };
          const webOptions = {};
          const allowedWebKeys = [
            "baudRate",
            "dataBits",
            "stopBits",
            "parity",
            "readTimeout",
            "writeTimeout",
            "reconnectInterval",
            "maxReconnectAttempts",
            "maxEmptyReadsBeforeReconnect"
          ];
          for (const key of allowedWebKeys) {
            if (key in options) {
              webOptions[key] = options[key];
            }
          }
          this.logger.debug("Creating WebSerialTransport with provided port");
          newTransport = new WebSerialTransport(portFactory, webOptions);
          break;
        }
        default:
          throw new Error(`Unknown transport type: ${info.type}`);
      }
    } catch (err) {
      this.logger.error(`Failed to create new transport of type "${info.type}": ${err.message}`);
      throw err;
    }
    const deviceTracker = new import_DeviceConnectionTracker.DeviceConnectionTracker();
    const portTracker = new import_PortConnectionTracker.PortConnectionTracker();
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
    if (wasConnected) {
      await this.connectTransport(id);
    }
    this.logger.info(`Transport "${id}" reloaded with new options`);
  }
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
          this.logger.debug(`Selected fallback transport ${id} for slave ${slaveId}`);
          return info.transport;
        }
      }
      this.logger.warn(`No connected transports found for slave ${slaveId}`);
      return null;
    }
    switch (this.loadBalancerStrategy) {
      case "round-robin":
        return this._getTransportRoundRobin(transportIds);
      case "sticky":
        return this._getTransportSticky(slaveId, transportIds);
      case "first-available":
      default:
        return this._getTransportFirstAvailable(transportIds);
    }
  }
  /**
   * Получить транспорт по стратегии round-robin
   */
  _getTransportRoundRobin(transportIds) {
    const connectedTransports = transportIds.map((id) => this.transports.get(id)).filter((info) => !!info && info.status === "connected");
    if (connectedTransports.length === 0) {
      return this._getTransportFirstAvailable(transportIds);
    }
    this._roundRobinIndex = (this._roundRobinIndex + 1) % connectedTransports.length;
    const selectedInfo = connectedTransports[this._roundRobinIndex];
    return selectedInfo?.transport ?? null;
  }
  /**
   * Получить транспорт по стратегии sticky
   */
  _getTransportSticky(slaveId, transportIds) {
    const lastUsedId = this._stickyMap.get(slaveId);
    if (lastUsedId) {
      const info = this.transports.get(lastUsedId);
      if (info && info.status === "connected" && transportIds.includes(lastUsedId)) {
        return info.transport;
      }
    }
    const transport = this._getTransportFirstAvailable(transportIds);
    if (transport) {
      const transportEntry = Array.from(this.transports.entries()).find(
        ([_id, info]) => info.transport === transport
      );
      if (transportEntry) {
        const newTransportId = transportEntry[0];
        this._stickyMap.set(slaveId, newTransportId);
      }
    }
    return transport;
  }
  /**
   * Получить транспорт по стратегии first-available
   */
  _getTransportFirstAvailable(transportIds) {
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
        reconnectAttempts: info.reconnectAttempts
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
        reconnectAttempts: info.reconnectAttempts
      };
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
  /**
   * Устанавливает стратегию балансировки.
   * @param strategy - Стратегия балансировки ('round-robin', 'sticky', 'first-available')
   */
  setLoadBalancer(strategy) {
    this.loadBalancerStrategy = strategy;
  }
  /**
   * Устанавливает обработчик состояния устройства для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
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
   * Устанавливает обработчик состояния порта для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
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
   * Внутренний метод: вызывается транспортом при изменении состояния устройства.
   */
  _onDeviceStateChange(transportId, slaveId, connected, error) {
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No device tracker found for transport "${transportId}"`);
      return;
    }
    if (connected) {
      tracker.notifyConnected(slaveId);
    } else {
      const errorType = error?.type || import_modbus_types.ConnectionErrorType.UnknownError;
      const errorMessage = error?.message || "Device disconnected";
      tracker.notifyDisconnected(slaveId, errorType, errorMessage);
    }
    const handler = this.transportToDeviceHandlerMap.get(transportId);
    if (handler) {
      handler(slaveId, connected, error);
    }
    if (this._externalDeviceStateHandler) {
      this._externalDeviceStateHandler(slaveId, connected, error);
    }
  }
  /**
   * Внутренний метод: вызывается транспортом при изменении состояния порта.
   */
  _onPortStateChange(transportId, connected, slaveIds, error) {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No port tracker found for transport "${transportId}"`);
      return;
    }
    if (connected) {
      tracker.notifyConnected();
    } else {
      const errorType = error?.type || import_modbus_types.ConnectionErrorType.UnknownError;
      const errorMessage = error?.message || "Port disconnected";
      tracker.notifyDisconnected(errorType, errorMessage, slaveIds);
    }
    const info = this.transports.get(transportId);
    if (info) {
      info.status = connected ? "connected" : "disconnected";
      if (!connected) {
        info.lastError = new Error(error?.message);
      }
    }
    const handler = this.transportToPortHandlerMap.get(transportId);
    if (handler) {
      handler(connected, slaveIds, error);
    }
    if (this._externalPortStateHandler) {
      this._externalPortStateHandler(connected, slaveIds, error);
    }
  }
  /**
   * Уничтожает контроллер транспорта.
   */
  async destroy() {
    await this.disconnectAll();
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
    this.logger.info("TransportController destroyed");
  }
}
module.exports = TransportController;
