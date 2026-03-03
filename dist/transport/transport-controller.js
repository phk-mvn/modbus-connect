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
var import_logger = __toESM(require("../logger.js"));
var import_polling_manager = __toESM(require("../polling-manager.js"));
var import_async_mutex = require("async-mutex");
var import_transport_factory = require("./modules/transport-factory.js");
var import_modbus_types = require("../types/modbus-types.js");
var import_DeviceConnectionTracker = require("./trackers/DeviceConnectionTracker.js");
var import_PortConnectionTracker = require("./trackers/PortConnectionTracker.js");
var import_errors = require("../errors.js");
var import_utils = require("../utils/utils.js");
class TransportController {
  /** Реестр всех добавленных транспортов */
  transports = /* @__PURE__ */ new Map();
  /** Карта соответствия: SlaveID -> Список ID транспортов, которые могут с ним работать */
  slaveTransportMap = /* @__PURE__ */ new Map();
  /** Текущая стратегия балансировки */
  loadBalancerStrategy = "first-available";
  loggerInstance = new import_logger.default();
  logger = this.loggerInstance.createLogger("TransportController");
  /**
   * Мьютекс для защиты реестра транспортов от состояния гонки (Race Conditions).
   * Блокирует одновременное выполнение add/remove/reload/destroy.
   */
  _registryMutex = new import_async_mutex.Mutex();
  // Переменные для стратегий балансировки
  _roundRobinIndex = 0;
  _stickyMap = /* @__PURE__ */ new Map();
  // Карты трекеров и обработчиков
  transportToDeviceTrackerMap = /* @__PURE__ */ new Map();
  transportToPortTrackerMap = /* @__PURE__ */ new Map();
  transportToDeviceHandlerMap = /* @__PURE__ */ new Map();
  transportToPortHandlerMap = /* @__PURE__ */ new Map();
  // Глобальные внешние обработчики
  _externalDeviceStateHandler = null;
  _externalPortStateHandler = null;
  constructor() {
    this.logger.setLevel("info");
  }
  /**
   * Устанавливает глобальный обработчик состояния устройств.
   * Вызывается при изменении состояния любого устройства на любом транспорте.
   * @param handler - Функция-обработчик
   */
  setDeviceStateHandler(handler) {
    this._externalDeviceStateHandler = handler;
  }
  /**
   * Устанавливает глобальный обработчик состояния портов.
   * Вызывается при подключении/отключении любого транспорта.
   * @param handler - Функция-обработчик
   */
  setPortStateHandler(handler) {
    this._externalPortStateHandler = handler;
  }
  /**
   * Добавляет новый транспорт в контроллер.
   *
   * Метод защищен мьютексом, чтобы предотвратить дублирование ID или конфликты
   * при одновременной инициализации нескольких транспортов.
   *
   * @param id - Уникальный идентификатор транспорта.
   * @param type - Тип транспорта ('node' | 'web' | 'node-tcp' | 'web-tcp').
   * @param options - Опции конфигурации транспорта (порт, скорость и т.д.).
   * @param reconnectOptions - Настройки автоматического переподключения.
   * @param pollingConfig - Конфигурация встроенного менеджера опроса (PollingManager).
   * @throws Error Если транспорт с таким ID уже существует или если произошла ошибка создания.
   */
  async addTransport(id, type, options, reconnectOptions, pollingConfig) {
    await this._registryMutex.runExclusive(async () => {
      if (this.transports.has(id)) {
        throw new Error(`Transport with id "${id}" already exists`);
      }
      const rsMode = options.RSMode ?? "RS485";
      const slaveIds = options.slaveIds || [];
      if (rsMode === "RS232" && slaveIds.length > 1) {
        throw new import_errors.RSModeConstraintError(
          `Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device. Provided ${slaveIds.length} devices.`
        );
      }
      const transport = await import_transport_factory.TransportFactory.create(type, options, this.logger);
      const seenSlaveIds = /* @__PURE__ */ new Set();
      for (const slaveId of slaveIds) {
        if (seenSlaveIds.has(slaveId)) {
          throw new Error(
            `Duplicate slave ID ${slaveId} provided for transport "${id}". Each slave ID must be unique per transport.`
          );
        }
        seenSlaveIds.add(slaveId);
      }
      const fallbacks = options.fallbacks || [];
      const pollingManager = new import_polling_manager.default(pollingConfig, this.loggerInstance);
      pollingManager.logger = this.loggerInstance.createLogger(`PM:${id}`);
      pollingManager.setLogLevelForAll("error");
      const info = {
        id,
        type,
        transport,
        pollingManager,
        status: "disconnected",
        slaveIds,
        rsMode: transport.getRSMode(),
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
      this.logger.info(`Transport "${id}" added with PollingManager`, { type, slaveIds });
    });
  }
  /**
   * Удаляет транспорт по указанному ID, останавливает задачи опроса и закрывает соединение.
   * Метод защищен мьютексом.
   *
   * @param id - ID транспорта.
   */
  async removeTransport(id) {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) return;
      info.pollingManager.clearAll();
      await this._disconnectTransportInternal(id);
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
    });
  }
  // =========================================================
  // Методы управления PollingManager (Прокси)
  // =========================================================
  _getTransportInfo(transportId) {
    const info = this.transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info;
  }
  /**
   * Добавляет задачу опроса в очередь указанного транспорта.
   * @param transportId - ID транспорта.
   * @param options - Параметры задачи.
   */
  addPollingTask(transportId, options) {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.addTask(options);
  }
  /**
   * Удаляет задачу опроса из транспорта.
   * @param transportId - ID транспорта.
   * @param taskId - ID задачи.
   */
  removePollingTask(transportId, taskId) {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.removeTask(taskId);
  }
  /**
   * Обновляет параметры существующей задачи опроса.
   */
  updatePollingTask(transportId, taskId, newOptions) {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.updateTask(taskId, newOptions);
  }
  /**
   * Управление состоянием конкретной задачи (старт/стоп/пауза).
   */
  controlTask(transportId, taskId, action) {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case "start":
        info.pollingManager.startTask(taskId);
        break;
      case "stop":
        info.pollingManager.stopTask(taskId);
        break;
      case "pause":
        info.pollingManager.pauseTask(taskId);
        break;
      case "resume":
        info.pollingManager.resumeTask(taskId);
        break;
    }
  }
  /**
   * Глобальное управление опросом на указанном транспорте.
   */
  controlPolling(transportId, action) {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case "startAll":
        info.pollingManager.startAllTasks();
        break;
      case "stopAll":
        info.pollingManager.stopAllTasks();
        break;
      case "pauseAll":
        info.pollingManager.pauseAllTasks();
        break;
      case "resumeAll":
        info.pollingManager.resumeAllTasks();
        break;
    }
  }
  /**
   * Возвращает статистику по всем задачам транспорта.
   */
  getPollingStats(transportId) {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getAllTaskStats();
  }
  /**
   * Возвращает информацию об очереди задач транспорта.
   */
  getPollingQueueInfo(transportId) {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getQueueInfo();
  }
  /**
   * Позволяет выполнить функцию (например, запись) с использованием мьютекса PollingManager'а.
   * Это гарантирует, что операция не прервет текущий опрос и будет выполнена атомарно.
   */
  async executeImmediate(transportId, fn) {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.executeImmediate(fn);
  }
  // =========================================================
  /**
   * Возвращает экземпляр транспорта по ID (или null).
   */
  getTransport(id) {
    const info = this.transports.get(id);
    return info ? info.transport : null;
  }
  /**
   * Возвращает список всех зарегистрированных транспортов.
   */
  listTransports() {
    return Array.from(this.transports.values());
  }
  /**
   * Инициирует подключение всех зарегистрированных транспортов.
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
   * Подключает конкретный транспорт.
   * Если подключение успешно, запускает/возобновляет опрос (PollingManager).
   *
   * @param id - ID транспорта.
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
      info.pollingManager.resumeAllTasks();
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
   * Отключает конкретный транспорт.
   */
  async disconnectTransport(id) {
    await this._disconnectTransportInternal(id);
  }
  /**
   * Внутренний метод отключения. Вызывает pause для поллинга и disconnect для транспорта.
   * Не использует глобальный мьютекс реестра, поэтому может безопасно вызываться внутри других защищенных методов.
   */
  async _disconnectTransportInternal(id) {
    const info = this.transports.get(id);
    if (!info) return;
    try {
      info.pollingManager.pauseAllTasks();
      await info.transport.disconnect();
      info.status = "disconnected";
      this.logger.info(`Transport "${id}" disconnected`);
    } catch (err) {
      this.logger.error(`Error disconnecting transport "${id}":`, err.message);
    }
  }
  /**
   * Привязывает Slave ID к транспорту.
   * Позволяет динамически маршрутизировать запросы для этого устройства через указанный транспорт.
   */
  assignSlaveIdToTransport(transportId, slaveId) {
    const info = this.transports.get(transportId);
    if (!info) {
      throw new Error(`Transport with id "${transportId}" not found`);
    }
    if (info.rsMode === "RS232" && info.slaveIds.length >= 1) {
      const existingSlaveId = info.slaveIds[0];
      throw new import_errors.RSModeConstraintError(
        `Cannot assign slaveId ${slaveId} to transport "${transportId}". It is in 'RS232' mode and already manages device ${existingSlaveId}.`
      );
    }
    if (info.slaveIds.includes(slaveId)) {
      throw new Error(
        `Cannot assign slave ID ${slaveId}". The transport is already managing this ID.`
      );
    }
    info.slaveIds.push(slaveId);
    this._updateSlaveTransportMap(transportId, [slaveId]);
    this.logger.info(`Assigned slaveId ${slaveId} to transport "${transportId}"`);
  }
  /**
   * Отвязывает Slave ID от транспорта.
   */
  removeSlaveIdFromTransport(transportId, slaveId) {
    const info = this.transports.get(transportId);
    if (!info) {
      this.logger.warn(
        `Attempted to remove slaveId ${slaveId} from non-existent transport "${transportId}"`
      );
      return;
    }
    const index = info.slaveIds.indexOf(slaveId);
    if (index !== -1) {
      info.slaveIds.splice(index, 1);
    } else {
      this.logger.warn(`SlaveId ${slaveId} was not found in transport "${transportId}"`);
      return;
    }
    const transportList = this.slaveTransportMap.get(slaveId);
    if (transportList) {
      const updatedList = transportList.filter((tid) => tid !== transportId);
      if (updatedList.length === 0) {
        this.slaveTransportMap.delete(slaveId);
      } else {
        this.slaveTransportMap.set(slaveId, updatedList);
      }
    }
    const stickyTransport = this._stickyMap.get(slaveId);
    if (stickyTransport === transportId) {
      this._stickyMap.delete(slaveId);
    }
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (tracker) {
      try {
        tracker.removeState(slaveId);
      } catch (err) {
        this.logger.warn(
          `Failed to remove state for slaveId ${slaveId} from tracker: ${err.message}`
        );
      }
    }
    const transportAny = info.transport;
    if (typeof transportAny.removeConnectedDevice === "function") {
      transportAny.removeConnectedDevice(slaveId);
    }
    this.logger.info(`Removed slaveId ${slaveId} from transport "${transportId}"`);
  }
  /**
   * Перезагружает (пересоздает) транспорт с новыми опциями.
   * Полезно для изменения настроек (BaudRate и т.д.) без рестарта приложения.
   * Метод защищен мьютексом.
   *
   * @param id - ID транспорта.
   * @param options - Новые настройки.
   */
  async reloadTransport(id, options) {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) throw new Error(`Transport with id "${id}" not found`);
      const wasConnected = info.status === "connected";
      info.pollingManager.clearAll();
      await this._disconnectTransportInternal(id);
      const newTransport = await import_transport_factory.TransportFactory.create(info.type, options, this.logger);
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
      info.rsMode = newTransport.getRSMode();
      if (wasConnected) {
        await this.connectTransport(id);
      }
      this.logger.info(`Transport "${id}" reloaded with new options`);
    });
  }
  /**
   * Прямая запись в порт через PollingManager (для атомарности).
   * Используется для отправки команд записи Modbus.
   */
  async writeToPort(transportId, data, readLength = 0, timeout = 3e3) {
    const info = this._getTransportInfo(transportId);
    if (!info.transport.isOpen) {
      throw new Error(
        `Transport "${transportId}" is not open (connection status: ${info.status}).`
      );
    }
    return info.pollingManager.executeImmediate(async () => {
      await info.transport.write(data);
      if (readLength > 0) {
        return info.transport.read(readLength, timeout);
      }
      await info.transport.flush();
      return (0, import_utils.allocUint8Array)(0);
    });
  }
  /**
   * Обновляет внутреннюю карту маршрутизации slaveId -> transportId.
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
   * Находит подходящий транспорт для указанного Slave ID с учетом требований RSMode
   * и выбранной стратегии балансировки нагрузки.
   */
  getTransportForSlave(slaveId, requiredRSMode) {
    const transportIds = this.slaveTransportMap.get(slaveId);
    if (transportIds && transportIds.length > 0) {
      let transport = null;
      switch (this.loadBalancerStrategy) {
        case "round-robin":
          transport = this._getTransportRoundRobin(transportIds);
          break;
        case "sticky":
          transport = this._getTransportSticky(slaveId, transportIds);
          break;
        case "first-available":
        default:
          transport = this._getTransportFirstAvailable(transportIds);
          break;
      }
      if (transport) {
        const info = Array.from(this.transports.values()).find((i) => i.transport === transport);
        if (info && info.rsMode === requiredRSMode) {
          return transport;
        }
      }
    }
    for (const info of this.transports.values()) {
      if (info.status === "connected" && info.rsMode === requiredRSMode) {
        if (requiredRSMode === "RS485" || requiredRSMode === "RS232" && info.slaveIds.length === 0) {
          return info.transport;
        }
      }
    }
    this.logger.warn(
      `No connected transport found for slave ${slaveId} with required RSMode ${requiredRSMode}`
    );
    return null;
  }
  // --- Стратегии выбора транспорта ---
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
   * Возвращает статус (диагностику) для конкретного транспорта или для всех сразу.
   */
  getStatus(id) {
    if (id) {
      const info = this.transports.get(id);
      if (!info) return {};
      const queueInfo = info.pollingManager.getQueueInfo();
      return {
        id: info.id,
        connected: info.status === "connected",
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
        pollingStats: {
          queueLength: queueInfo.queueLength,
          tasksRunning: info.pollingManager.getSystemStats().tasks ? Object.keys(info.pollingManager.getSystemStats().tasks).length : 0
        }
      };
    }
    const result = {};
    for (const [tid, info] of this.transports) {
      const queueInfo = info.pollingManager.getQueueInfo();
      result[tid] = {
        id: info.id,
        connected: info.status === "connected",
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
        pollingStats: {
          queueLength: queueInfo.queueLength,
          tasksRunning: info.pollingManager.getSystemStats().tasks ? Object.keys(info.pollingManager.getSystemStats().tasks).length : 0
        }
      };
    }
    return result;
  }
  /**
   * Возвращает количество активных (подключенных) транспортов.
   */
  getActiveTransportCount() {
    let count = 0;
    for (const info of this.transports.values()) {
      if (info.status === "connected") count++;
    }
    return count;
  }
  /**
   * Устанавливает стратегию балансировки нагрузки.
   */
  setLoadBalancer(strategy) {
    this.loadBalancerStrategy = strategy;
  }
  /**
   * Устанавливает персональный обработчик состояния устройства для конкретного транспорта.
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
   * Устанавливает персональный обработчик состояния порта для конкретного транспорта.
   */
  async setPortStateHandlerForTransport(transportId, handler) {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      throw new Error(`No port tracker found for transport "${transportId}"`);
    }
    await tracker.setHandler(handler);
    this.transportToPortHandlerMap.set(transportId, handler);
  }
  // --- Внутренние обработчики событий (Callbacks) ---
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
  _onPortStateChange(transportId, connected, slaveIds, error) {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No port tracker found for transport "${transportId}"`);
      return;
    }
    const info = this.transports.get(transportId);
    if (connected) {
      tracker.notifyConnected();
      if (info) info.pollingManager.resumeAllTasks();
    } else {
      const errorType = error?.type || import_modbus_types.ConnectionErrorType.UnknownError;
      const errorMessage = error?.message || "Port disconnected";
      tracker.notifyDisconnected(errorType, errorMessage, slaveIds);
      if (info) info.pollingManager.pauseAllTasks();
    }
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
   * Уничтожает контроллер: останавливает все задачи, отключает транспорты и очищает память.
   * Метод защищен мьютексом для предотвращения новых добавлений во время уничтожения.
   */
  async destroy() {
    await this._registryMutex.runExclusive(async () => {
      for (const info of this.transports.values()) {
        info.pollingManager.clearAll();
      }
      await Promise.all(
        Array.from(this.transports.values()).map((info) => this._disconnectTransportInternal(info.id))
      );
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
    this.logger.info("TransportController destroyed");
  }
}
module.exports = TransportController;
