// src/transport/transport-controller.ts

import Logger from '../logger.js';
import PollingManager from '../polling-manager.js';

import { Mutex } from 'async-mutex';
import { TransportFactory } from './modules/transport-factory.js';
import { ConnectionErrorType } from '../types/modbus-types.js';
import { DeviceConnectionTracker } from './trackers/DeviceConnectionTracker.js';
import { PortConnectionTracker } from './trackers/PortConnectionTracker.js';
import { RSModeConstraintError } from '../errors.js';
import { allocUint8Array } from '../utils/utils.js';

import type {
  Transport,
  WebSerialPort,
  NodeSerialTransportOptions,
  WebSerialTransportOptions,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
  PollingTaskOptions,
  PollingTaskStats,
  PollingManagerConfig,
  PollingQueueInfo,
} from '../types/modbus-types.js';

/**
 * Внутренняя структура для хранения информации о транспорте.
 */
interface TransportInfo {
  /** Уникальный ID транспорта */
  id: string;
  /** Тип окружения */
  type: 'node' | 'web' | 'node-tcp' | 'web-tcp';
  /** Экземпляр транспорта */
  transport: Transport;
  /** Менеджер опроса, привязанный к этому транспорту */
  pollingManager: PollingManager;
  /** Текущий статус подключения */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Список Slave ID, привязанных к этому транспорту */
  slaveIds: number[];
  /** Режим работы (RS485/RS232) */
  rsMode: RSMode;
  /** Список ID резервных транспортов (не реализовано в полной мере, задел на будущее) */
  fallbacks: string[];
  /** Дата создания */
  createdAt: Date;
  /** Последняя ошибка */
  lastError?: Error;
  /** Текущее количество попыток переподключения */
  reconnectAttempts: number;
  /** Максимальное количество попыток переподключения */
  maxReconnectAttempts: number;
  /** Интервал между попытками переподключения (мс) */
  reconnectInterval: number;
}

/**
 * Публичный статус транспорта для внешних потребителей.
 */
interface TransportStatus {
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

/** Стратегии балансировки нагрузки при выборе транспорта */
type LoadBalancerStrategy = 'round-robin' | 'sticky' | 'first-available';

/**
 * Контроллер транспорта (TransportController).
 *
 * Основной класс, управляющий жизненным циклом всех транспортных соединений (Node/Web Serial),
 * маршрутизацией запросов к устройствам (Slave ID), балансировкой нагрузки и отслеживанием состояния.
 */
class TransportController {
  /** Реестр всех добавленных транспортов */
  private transports: Map<string, TransportInfo> = new Map();
  /** Карта соответствия: SlaveID -> Список ID транспортов, которые могут с ним работать */
  private slaveTransportMap: Map<number, string[]> = new Map();
  /** Текущая стратегия балансировки */
  private loadBalancerStrategy: LoadBalancerStrategy = 'first-available';

  private loggerInstance = new Logger();
  private logger = this.loggerInstance.createLogger('TransportController');

  /**
   * Мьютекс для защиты реестра транспортов от состояния гонки (Race Conditions).
   * Блокирует одновременное выполнение add/remove/reload/destroy.
   */
  private readonly _registryMutex = new Mutex();

  // Переменные для стратегий балансировки
  private _roundRobinIndex: number = 0;
  private readonly _stickyMap = new Map<number, string>();

  // Карты трекеров и обработчиков
  private transportToDeviceTrackerMap: Map<string, DeviceConnectionTracker> = new Map();
  private transportToPortTrackerMap: Map<string, PortConnectionTracker> = new Map();
  private transportToDeviceHandlerMap: Map<string, DeviceStateHandler> = new Map();
  private transportToPortHandlerMap: Map<string, PortStateHandler> = new Map();

  // Глобальные внешние обработчики
  private _externalDeviceStateHandler: DeviceStateHandler | null = null;
  private _externalPortStateHandler: PortStateHandler | null = null;

  constructor() {
    this.logger.setLevel('info');
  }

  /**
   * Устанавливает глобальный обработчик состояния устройств.
   * Вызывается при изменении состояния любого устройства на любом транспорте.
   * @param handler - Функция-обработчик
   */
  public setDeviceStateHandler(handler: DeviceStateHandler): void {
    this._externalDeviceStateHandler = handler;
  }

  /**
   * Устанавливает глобальный обработчик состояния портов.
   * Вызывается при подключении/отключении любого транспорта.
   * @param handler - Функция-обработчик
   */
  public setPortStateHandler(handler: PortStateHandler): void {
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
  async addTransport(
    id: string,
    type: 'node' | 'web' | 'node-tcp' | 'web-tcp',
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: PollingManagerConfig
  ): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      if (this.transports.has(id)) {
        throw new Error(`Transport with id "${id}" already exists`);
      }

      const rsMode = options.RSMode ?? 'RS485';
      const slaveIds = (options as any).slaveIds || [];

      // Валидация режима RS232 (только одно устройство)
      if (rsMode === 'RS232' && slaveIds.length > 1) {
        throw new RSModeConstraintError(
          `Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device. Provided ${slaveIds.length} devices.`
        );
      }

      // Создание инстанса через фабрику
      const transport = await TransportFactory.create(type, options, this.logger);

      // Проверка дубликатов Slave ID внутри одного транспорта
      const seenSlaveIds = new Set<number>();
      for (const slaveId of slaveIds) {
        if (seenSlaveIds.has(slaveId)) {
          throw new Error(
            `Duplicate slave ID ${slaveId} provided for transport "${id}". Each slave ID must be unique per transport.`
          );
        }
        seenSlaveIds.add(slaveId);
      }

      const fallbacks = (options as any).fallbacks || [];

      // Инициализация менеджера опроса
      const pollingManager = new PollingManager(pollingConfig, this.loggerInstance);
      pollingManager.logger = this.loggerInstance.createLogger(`PM:${id}`);
      pollingManager.setLogLevelForAll('error');

      const info: TransportInfo = {
        id,
        type,
        transport,
        pollingManager,
        status: 'disconnected',
        slaveIds,
        rsMode: transport.getRSMode(),
        fallbacks,
        createdAt: new Date(),
        reconnectAttempts: 0,
        maxReconnectAttempts: reconnectOptions?.maxReconnectAttempts ?? 5,
        reconnectInterval: reconnectOptions?.reconnectInterval ?? 2000,
      };

      this.transports.set(id, info);

      // Инициализация трекеров состояния
      const deviceTracker = new DeviceConnectionTracker();
      const portTracker = new PortConnectionTracker();

      this.transportToDeviceTrackerMap.set(id, deviceTracker);
      this.transportToPortTrackerMap.set(id, portTracker);

      // Подписка на события транспорта
      transport.setDeviceStateHandler((slaveId, connected, error) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      transport.setPortStateHandler((connected, slaveIds, error) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      // Обновление карты маршрутизации
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
  async removeTransport(id: string): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) return;

      info.pollingManager.clearAll();

      // Безопасное отключение
      await this._disconnectTransportInternal(id);

      this.transports.delete(id);

      // Очистка карт и трекеров
      this.transportToDeviceTrackerMap.delete(id);
      this.transportToPortTrackerMap.delete(id);
      this.transportToDeviceHandlerMap.delete(id);
      this.transportToPortHandlerMap.delete(id);

      // Обновление карты маршрутизации
      for (const [slaveId, list] of this.slaveTransportMap.entries()) {
        const updated = list.filter(tid => tid !== id);
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

  private _getTransportInfo(transportId: string): TransportInfo {
    const info = this.transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info;
  }

  /**
   * Добавляет задачу опроса в очередь указанного транспорта.
   * @param transportId - ID транспорта.
   * @param options - Параметры задачи.
   */
  public addPollingTask(transportId: string, options: PollingTaskOptions): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.addTask(options);
  }

  /**
   * Удаляет задачу опроса из транспорта.
   * @param transportId - ID транспорта.
   * @param taskId - ID задачи.
   */
  public removePollingTask(transportId: string, taskId: string): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.removeTask(taskId);
  }

  /**
   * Обновляет параметры существующей задачи опроса.
   */
  public updatePollingTask(
    transportId: string,
    taskId: string,
    newOptions: Partial<PollingTaskOptions>
  ): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.updateTask(taskId, newOptions);
  }

  /**
   * Управление состоянием конкретной задачи (старт/стоп/пауза).
   */
  public controlTask(
    transportId: string,
    taskId: string,
    action: 'start' | 'stop' | 'pause' | 'resume'
  ): void {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case 'start':
        info.pollingManager.startTask(taskId);
        break;
      case 'stop':
        info.pollingManager.stopTask(taskId);
        break;
      case 'pause':
        info.pollingManager.pauseTask(taskId);
        break;
      case 'resume':
        info.pollingManager.resumeTask(taskId);
        break;
    }
  }

  /**
   * Глобальное управление опросом на указанном транспорте.
   */
  public controlPolling(
    transportId: string,
    action: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'
  ): void {
    const info = this._getTransportInfo(transportId);
    switch (action) {
      case 'startAll':
        info.pollingManager.startAllTasks();
        break;
      case 'stopAll':
        info.pollingManager.stopAllTasks();
        break;
      case 'pauseAll':
        info.pollingManager.pauseAllTasks();
        break;
      case 'resumeAll':
        info.pollingManager.resumeAllTasks();
        break;
    }
  }

  /**
   * Возвращает статистику по всем задачам транспорта.
   */
  public getPollingStats(transportId: string): Record<string, PollingTaskStats> {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getAllTaskStats();
  }

  /**
   * Возвращает информацию об очереди задач транспорта.
   */
  public getPollingQueueInfo(transportId: string): PollingQueueInfo {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getQueueInfo();
  }

  /**
   * Позволяет выполнить функцию (например, запись) с использованием мьютекса PollingManager'а.
   * Это гарантирует, что операция не прервет текущий опрос и будет выполнена атомарно.
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.executeImmediate(fn);
  }

  // =========================================================

  /**
   * Возвращает экземпляр транспорта по ID (или null).
   */
  getTransport(id: string): Transport | null {
    const info = this.transports.get(id);
    return info ? info.transport : null;
  }

  /**
   * Возвращает список всех зарегистрированных транспортов.
   */
  listTransports(): TransportInfo[] {
    return Array.from(this.transports.values());
  }

  /**
   * Инициирует подключение всех зарегистрированных транспортов.
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
   * Подключает конкретный транспорт.
   * Если подключение успешно, запускает/возобновляет опрос (PollingManager).
   *
   * @param id - ID транспорта.
   */
  async connectTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);
    if (info.status === 'connecting' || info.status === 'connected') return;

    info.status = 'connecting';
    try {
      await info.transport.connect();
      info.status = 'connected';
      info.reconnectAttempts = 0;

      // Возобновляем опрос при успешном подключении
      info.pollingManager.resumeAllTasks();

      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = 'error';
      info.lastError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Failed to connect transport "${id}":`, info.lastError.message);

      // Логика авто-реконнекта при ошибке начального подключения
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
  async disconnectTransport(id: string): Promise<void> {
    await this._disconnectTransportInternal(id);
  }

  /**
   * Внутренний метод отключения. Вызывает pause для поллинга и disconnect для транспорта.
   * Не использует глобальный мьютекс реестра, поэтому может безопасно вызываться внутри других защищенных методов.
   */
  private async _disconnectTransportInternal(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) return;

    try {
      info.pollingManager.pauseAllTasks();

      await info.transport.disconnect();
      info.status = 'disconnected';
      this.logger.info(`Transport "${id}" disconnected`);
    } catch (err) {
      this.logger.error(`Error disconnecting transport "${id}":`, (err as Error).message);
    }
  }

  /**
   * Привязывает Slave ID к транспорту.
   * Позволяет динамически маршрутизировать запросы для этого устройства через указанный транспорт.
   */
  assignSlaveIdToTransport(transportId: string, slaveId: number): void {
    const info = this.transports.get(transportId);
    if (!info) {
      throw new Error(`Transport with id "${transportId}" not found`);
    }

    if (info.rsMode === 'RS232' && info.slaveIds.length >= 1) {
      const existingSlaveId = info.slaveIds[0];
      throw new RSModeConstraintError(
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
  removeSlaveIdFromTransport(transportId: string, slaveId: number): void {
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

    // Обновляем карту маршрутизации
    const transportList = this.slaveTransportMap.get(slaveId);
    if (transportList) {
      const updatedList = transportList.filter(tid => tid !== transportId);
      if (updatedList.length === 0) {
        this.slaveTransportMap.delete(slaveId);
      } else {
        this.slaveTransportMap.set(slaveId, updatedList);
      }
    }

    // Удаляем из sticky map, если он был привязан туда
    const stickyTransport = this._stickyMap.get(slaveId);
    if (stickyTransport === transportId) {
      this._stickyMap.delete(slaveId);
    }

    // Удаляем состояние из трекера
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (tracker) {
      try {
        tracker.removeState(slaveId);
      } catch (err: any) {
        this.logger.warn(
          `Failed to remove state for slaveId ${slaveId} from tracker: ${err.message}`
        );
      }
    }

    // Если транспорт поддерживает метод удаления устройства (опционально)
    const transportAny = info.transport as any;
    if (typeof transportAny.removeConnectedDevice === 'function') {
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
  async reloadTransport(
    id: string,
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort })
  ): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      const info = this.transports.get(id);
      if (!info) throw new Error(`Transport with id "${id}" not found`);

      const wasConnected = info.status === 'connected';

      info.pollingManager.clearAll();

      await this._disconnectTransportInternal(id);

      // Создаем новый экземпляр через фабрику
      const newTransport = await TransportFactory.create(info.type, options, this.logger);

      // Пересоздаем трекеры (или можно очистить старые, но new надежнее)
      const deviceTracker = new DeviceConnectionTracker();
      const portTracker = new PortConnectionTracker();

      this.transportToDeviceTrackerMap.set(id, deviceTracker);
      this.transportToPortTrackerMap.set(id, portTracker);

      // Восстанавливаем подписки
      newTransport.setDeviceStateHandler((slaveId, connected, error) => {
        this._onDeviceStateChange(id, slaveId, connected, error);
      });

      newTransport.setPortStateHandler((connected, slaveIds, error) => {
        this._onPortStateChange(id, connected, slaveIds, error);
      });

      // Восстанавливаем внешние хендлеры конкретного транспорта
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
  public async writeToPort(
    transportId: string,
    data: Uint8Array,
    readLength: number = 0,
    timeout: number = 3000
  ): Promise<Uint8Array> {
    const info = this._getTransportInfo(transportId);

    if (!info.transport.isOpen) {
      throw new Error(
        `Transport "${transportId}" is not open (connection status: ${info.status}).`
      );
    }

    return info.pollingManager.executeImmediate(async () => {
      await (info.transport as any).write(data);

      if (readLength > 0) {
        return (info.transport as any).read(readLength, timeout);
      }

      await (info.transport as any).flush();

      return allocUint8Array(0);
    });
  }

  /**
   * Обновляет внутреннюю карту маршрутизации slaveId -> transportId.
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
   * Находит подходящий транспорт для указанного Slave ID с учетом требований RSMode
   * и выбранной стратегии балансировки нагрузки.
   */
  getTransportForSlave(slaveId: number, requiredRSMode: RSMode): Transport | null {
    const transportIds = this.slaveTransportMap.get(slaveId);

    if (transportIds && transportIds.length > 0) {
      let transport: Transport | null = null;

      switch (this.loadBalancerStrategy) {
        case 'round-robin':
          transport = this._getTransportRoundRobin(transportIds);
          break;
        case 'sticky':
          transport = this._getTransportSticky(slaveId, transportIds);
          break;
        case 'first-available':
        default:
          transport = this._getTransportFirstAvailable(transportIds);
          break;
      }

      if (transport) {
        const info = Array.from(this.transports.values()).find(i => i.transport === transport);
        if (info && info.rsMode === requiredRSMode) {
          return transport;
        }
      }
    }

    // Если прямого соответствия нет, ищем свободный транспорт (особенно актуально для RS485)
    for (const info of this.transports.values()) {
      if (info.status === 'connected' && info.rsMode === requiredRSMode) {
        if (
          requiredRSMode === 'RS485' ||
          (requiredRSMode === 'RS232' && info.slaveIds.length === 0)
        ) {
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

  private _getTransportRoundRobin(transportIds: string[]): Transport | null {
    const connectedTransports = transportIds
      .map(id => this.transports.get(id))
      .filter((info): info is TransportInfo => !!info && info.status === 'connected');

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
  private _getTransportSticky(slaveId: number, transportIds: string[]): Transport | null {
    const lastUsedId = this._stickyMap.get(slaveId);

    if (lastUsedId) {
      const info = this.transports.get(lastUsedId);
      if (info && info.status === 'connected' && transportIds.includes(lastUsedId)) {
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
  private _getTransportFirstAvailable(transportIds: string[]): Transport | null {
    for (const id of transportIds) {
      const info = this.transports.get(id);
      if (info && info.status === 'connected') {
        return info.transport;
      }
    }

    // Fallbacks (резервные каналы)
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

  /**
   * Возвращает статус (диагностику) для конкретного транспорта или для всех сразу.
   */
  getStatus(id?: string): TransportStatus | Record<string, TransportStatus> {
    if (id) {
      const info = this.transports.get(id);
      if (!info) return {} as TransportStatus;

      const queueInfo = info.pollingManager.getQueueInfo();

      return {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
        pollingStats: {
          queueLength: queueInfo.queueLength,
          tasksRunning: info.pollingManager.getSystemStats().tasks
            ? Object.keys(info.pollingManager.getSystemStats().tasks).length
            : 0,
        },
      };
    }

    const result: Record<string, TransportStatus> = {};
    for (const [tid, info] of this.transports) {
      const queueInfo = info.pollingManager.getQueueInfo();
      result[tid] = {
        id: info.id,
        connected: info.status === 'connected',
        lastError: info.lastError,
        connectedSlaveIds: info.slaveIds,
        uptime: Date.now() - info.createdAt.getTime(),
        reconnectAttempts: info.reconnectAttempts,
        pollingStats: {
          queueLength: queueInfo.queueLength,
          tasksRunning: info.pollingManager.getSystemStats().tasks
            ? Object.keys(info.pollingManager.getSystemStats().tasks).length
            : 0,
        },
      };
    }
    return result;
  }

  /**
   * Возвращает количество активных (подключенных) транспортов.
   */
  getActiveTransportCount(): number {
    let count = 0;
    for (const info of this.transports.values()) {
      if (info.status === 'connected') count++;
    }
    return count;
  }

  /**
   * Устанавливает стратегию балансировки нагрузки.
   */
  setLoadBalancer(strategy: LoadBalancerStrategy): void {
    this.loadBalancerStrategy = strategy;
  }

  /**
   * Устанавливает персональный обработчик состояния устройства для конкретного транспорта.
   */
  async setDeviceStateHandlerForTransport(
    transportId: string,
    handler: DeviceStateHandler
  ): Promise<void> {
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
  async setPortStateHandlerForTransport(
    transportId: string,
    handler: PortStateHandler
  ): Promise<void> {
    const tracker = this.transportToPortTrackerMap.get(transportId);
    if (!tracker) {
      throw new Error(`No port tracker found for transport "${transportId}"`);
    }

    await tracker.setHandler(handler);
    this.transportToPortHandlerMap.set(transportId, handler);
  }

  // --- Внутренние обработчики событий (Callbacks) ---

  private _onDeviceStateChange(
    transportId: string,
    slaveId: number,
    connected: boolean,
    error?: { type: string; message: string }
  ): void {
    const tracker = this.transportToDeviceTrackerMap.get(transportId);
    if (!tracker) {
      this.logger.warn(`No device tracker found for transport "${transportId}"`);
      return;
    }

    if (connected) {
      tracker.notifyConnected(slaveId);
    } else {
      const errorType = (error?.type as ConnectionErrorType) || ConnectionErrorType.UnknownError;
      const errorMessage = error?.message || 'Device disconnected';
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

  private _onPortStateChange(
    transportId: string,
    connected: boolean,
    slaveIds?: number[],
    error?: { type: string; message: string }
  ): void {
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
      const errorType = (error?.type as ConnectionErrorType) || ConnectionErrorType.UnknownError;
      const errorMessage = error?.message || 'Port disconnected';
      tracker.notifyDisconnected(errorType, errorMessage, slaveIds);

      if (info) info.pollingManager.pauseAllTasks();
    }

    if (info) {
      info.status = connected ? 'connected' : 'disconnected';
      if (!connected) {
        info.lastError = new Error(error?.message);
      }
    }

    const handler = this.transportToPortHandlerMap.get(transportId);
    if (handler) {
      handler(connected, slaveIds, error as any);
    }

    if (this._externalPortStateHandler) {
      this._externalPortStateHandler(connected, slaveIds, error as any);
    }
  }

  /**
   * Уничтожает контроллер: останавливает все задачи, отключает транспорты и очищает память.
   * Метод защищен мьютексом для предотвращения новых добавлений во время уничтожения.
   */
  async destroy(): Promise<void> {
    await this._registryMutex.runExclusive(async () => {
      for (const info of this.transports.values()) {
        info.pollingManager.clearAll();
      }

      await Promise.all(
        Array.from(this.transports.values()).map(info => this._disconnectTransportInternal(info.id))
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

    this.logger.info('TransportController destroyed');
  }
}

export = TransportController;
