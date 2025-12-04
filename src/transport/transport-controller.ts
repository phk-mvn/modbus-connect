// src/transport/transport-controller.ts

import Logger from '../logger.js';
import PollingManager from '../polling-manager.js';
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
import { ConnectionErrorType } from '../types/modbus-types.js';
import { DeviceConnectionTracker } from './trackers/DeviceConnectionTracker.js';
import { PortConnectionTracker } from './trackers/PortConnectionTracker.js';
import { RSModeConstraintError } from '../errors.js';
import { allocUint8Array } from '../utils/utils.js';

interface TransportInfo {
  id: string;
  type: 'node' | 'web';
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

type LoadBalancerStrategy = 'round-robin' | 'sticky' | 'first-available';

/**
 * Контроллер транспорта для управления подключениями к устройствам.
 * Также управляет задачами опроса (PollingManager) для каждого транспорта.
 */
class TransportController {
  private transports: Map<string, TransportInfo> = new Map();
  private slaveTransportMap: Map<number, string[]> = new Map();
  private loadBalancerStrategy: LoadBalancerStrategy = 'first-available';
  private loggerInstance = new Logger();
  private logger = this.loggerInstance.createLogger('TransportController');

  private _roundRobinIndex: number = 0;
  private readonly _stickyMap = new Map<number, string>();

  private transportToDeviceTrackerMap: Map<string, DeviceConnectionTracker> = new Map();
  private transportToPortTrackerMap: Map<string, PortConnectionTracker> = new Map();
  private transportToDeviceHandlerMap: Map<string, DeviceStateHandler> = new Map();
  private transportToPortHandlerMap: Map<string, PortStateHandler> = new Map();

  private _externalDeviceStateHandler: DeviceStateHandler | null = null;
  private _externalPortStateHandler: PortStateHandler | null = null;

  constructor() {
    this.logger.setLevel('info');
  }

  /**
   * Устанавливает обработчик состояния устройства для внешнего мира.
   * @param handler - Обработчик состояния
   */
  public setDeviceStateHandler(handler: DeviceStateHandler): void {
    this._externalDeviceStateHandler = handler;
  }

  /**
   * Устанавливает обработчик состояния порта для внешнего мира.
   * @param handler - Обработчик состояния
   */
  public setPortStateHandler(handler: PortStateHandler): void {
    this._externalPortStateHandler = handler;
  }

  /**
   * Добавляет транспорт и инициализирует его PollingManager.
   * @param id - ID транспорта
   * @param type - Тип транспорта ('node' или 'web')
   * @param options - Опции транспорта
   * @param reconnectOptions - Параметры переподключения
   * @param pollingConfig - Конфигурация для PollingManager
   */
  async addTransport(
    id: string,
    type: 'node' | 'web',
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort }),
    reconnectOptions?: {
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    },
    pollingConfig?: PollingManagerConfig
  ): Promise<void> {
    if (this.transports.has(id)) {
      throw new Error(`Transport with id "${id}" already exists`);
    }

    const rsMode = options.RSMode ?? 'RS485';
    const slaveIds = (options as any).slaveIds || [];

    if (rsMode === 'RS232' && slaveIds.length > 1) {
      throw new RSModeConstraintError(
        `Transport "${id}" with RSMode 'RS232' cannot be assigned more than one device. Provided ${slaveIds.length} devices.`
      );
    }

    let transport: Transport;

    try {
      switch (type) {
        case 'node': {
          const path = (options as any).port || (options as any).path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }
          const NodeSerialTransport = (await import('./node-transports/node-serialport.js'))
            .default;
          const nodeOptions: NodeSerialTransportOptions = {};

          const allowedNodeKeys = [
            'baudRate',
            'dataBits',
            'stopBits',
            'parity',
            'readTimeout',
            'writeTimeout',
            'maxBufferSize',
            'reconnectInterval',
            'maxReconnectAttempts',
            'RSMode',
          ];

          for (const key of allowedNodeKeys) {
            if (key in options) {
              (nodeOptions as any)[key] = (options as any)[key];
            }
          }
          transport = new NodeSerialTransport(path, nodeOptions);
          break;
        }

        case 'web': {
          const webOptionsIn = options as WebSerialTransportOptions & { port: WebSerialPort };
          const port = webOptionsIn.port;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }
          const WebSerialTransport = (await import('./web-transports/web-serialport.js')).default;
          const portFactory = async (): Promise<any> => {
            this.logger.debug('WebSerialTransport portFactory: Returning provided port instance');
            try {
              if (port.readable || port.writable) {
                this.logger.debug(
                  'WebSerialTransport portFactory: Port seems to be in use, trying to close...'
                );
                try {
                  await port.close();
                  this.logger.debug('WebSerialTransport portFactory: Existing port closed');
                } catch (closeErr: any) {
                  this.logger.warn(
                    'WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):',
                    closeErr.message
                  );
                }
              }
            } catch (err: any) {
              this.logger.error(
                'WebSerialTransport portFactory: Failed to prepare existing port for reuse:',
                err
              );
            }
            return port;
          };
          const webOptions: WebSerialTransportOptions = {};

          const allowedWebKeys = [
            'baudRate',
            'dataBits',
            'stopBits',
            'parity',
            'readTimeout',
            'writeTimeout',
            'reconnectInterval',
            'maxReconnectAttempts',
            'maxEmptyReadsBeforeReconnect',
            'RSMode',
          ];

          for (const key of allowedWebKeys) {
            if (key in webOptionsIn) {
              (webOptions as any)[key] = (webOptionsIn as any)[key];
            }
          }
          this.logger.debug('Creating WebSerialTransport with provided port');
          transport = new WebSerialTransport(portFactory, webOptions);
          break;
        }

        default:
          throw new Error(`Unknown transport type: ${type}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to create transport of type "${type}": ${err.message}`);
      throw err;
    }

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

    const deviceTracker = new DeviceConnectionTracker();
    const portTracker = new PortConnectionTracker();

    this.transportToDeviceTrackerMap.set(id, deviceTracker);
    this.transportToPortTrackerMap.set(id, portTracker);

    transport.setDeviceStateHandler((slaveId, connected, error) => {
      this._onDeviceStateChange(id, slaveId, connected, error);
    });

    transport.setPortStateHandler((connected, slaveIds, error) => {
      this._onPortStateChange(id, connected, slaveIds, error);
    });

    this._updateSlaveTransportMap(id, slaveIds);

    this.logger.info(`Transport "${id}" added with PollingManager`, { type, slaveIds });
  }

  /**
   * Удаляет транспорт по указанному ID.
   * @param id - ID транспорта
   */
  async removeTransport(id: string): Promise<void> {
    const info = this.transports.get(id);
    if (!info) return;

    info.pollingManager.clearAll();

    await this.disconnectTransport(id);
    this.transports.delete(id);

    this.transportToDeviceTrackerMap.delete(id);
    this.transportToPortTrackerMap.delete(id);
    this.transportToDeviceHandlerMap.delete(id);
    this.transportToPortHandlerMap.delete(id);

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

  // =========================================================
  // Методы управления PollingManager (Прокси)
  // =========================================================

  private _getTransportInfo(transportId: string): TransportInfo {
    const info = this.transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info;
  }

  /**
   * Добавляет задачу опроса в указанный транспорт.
   * @param transportId - ID транспорта
   * @param options - Опции задачи
   */
  public addPollingTask(transportId: string, options: PollingTaskOptions): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.addTask(options);
  }

  /**
   * Удаляет задачу опроса из указанного транспорта.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   */
  public removePollingTask(transportId: string, taskId: string): void {
    const info = this._getTransportInfo(transportId);
    info.pollingManager.removeTask(taskId);
  }

  /**
   * Обновляет задачу опроса.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   * @param newOptions - Новые опции
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
   * Управление состоянием конкретной задачи.
   * @param transportId - ID транспорта
   * @param taskId - ID задачи
   * @param action - Действие (start, stop, pause, resume)
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
   * Управление всем опросом на транспорте.
   * @param transportId - ID транспорта
   * @param action - Действие (startAll, stopAll, pauseAll, resumeAll)
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
   * Получает статистику задач для транспорта.
   * @param transportId - ID транспорта
   * @returns Статистика задач
   */
  public getPollingStats(transportId: string): Record<string, PollingTaskStats> {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getAllTaskStats();
  }

  /**
   * Получает информацию об очереди.
   * @param transportId - ID транспорта
   * @returns Информация об очереди
   */
  public getPollingQueueInfo(transportId: string): PollingQueueInfo {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.getQueueInfo();
  }

  /**
   * Позволяет выполнить функцию (например, запись) с использованием мьютекса PollingManager'а транспорта.
   * Это предотвращает конфликты между опросом и ручными командами.
   * @param transportId - ID транспорта
   * @param fn - Функция для выполнения
   * @returns Результат выполнения функции
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const info = this._getTransportInfo(transportId);
    return info.pollingManager.executeImmediate(fn);
  }

  // =========================================================

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
      info.reconnectAttempts = 0;

      info.pollingManager.resumeAllTasks();

      this.logger.info(`Transport "${id}" connected`);
    } catch (err) {
      info.status = 'error';
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
  async disconnectTransport(id: string): Promise<void> {
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
   * Назначить slaveId транспорту. Если транспорт уже обслуживает этот slaveId — игнорирует.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
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
   * Удаляет slaveId из транспорта.
   * Позволяет отвязать устройство, чтобы потом подключить его заново.
   * @param transportId - ID транспорта
   * @param slaveId - ID устройства
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

    const transportList = this.slaveTransportMap.get(slaveId);
    if (transportList) {
      const updatedList = transportList.filter(tid => tid !== transportId);

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
      } catch (err: any) {
        this.logger.warn(
          `Failed to remove state for slaveId ${slaveId} from tracker: ${err.message}`
        );
      }
    }

    const transportAny = info.transport as any;
    if (typeof transportAny.removeConnectedDevice === 'function') {
      transportAny.removeConnectedDevice(slaveId);
    }

    this.logger.info(`Removed slaveId ${slaveId} from transport "${transportId}"`);
  }

  /**
   * Перезагружает транспорт с новыми опциями.
   * @param id - ID транспорта
   * @param options - Новые опции
   */
  async reloadTransport(
    id: string,
    options: NodeSerialTransportOptions | (WebSerialTransportOptions & { port: WebSerialPort })
  ): Promise<void> {
    const info = this.transports.get(id);
    if (!info) throw new Error(`Transport with id "${id}" not found`);

    const wasConnected = info.status === 'connected';

    info.pollingManager.clearAll();

    await this.disconnectTransport(id);

    let newTransport: Transport;

    try {
      switch (info.type) {
        case 'node': {
          const nodeOptionsIn = options as NodeSerialTransportOptions;
          const path = (nodeOptionsIn as any).port || (nodeOptionsIn as any).path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }

          const NodeSerialTransport = (await import('./node-transports/node-serialport.js'))
            .default;

          newTransport = new NodeSerialTransport(path, nodeOptionsIn);
          break;
        }

        case 'web': {
          const webOptionsIn = options as WebSerialTransportOptions & { port: WebSerialPort };
          const port = webOptionsIn.port;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }

          const WebSerialTransport = (await import('./web-transports/web-serialport.js')).default;

          const portFactory = async (): Promise<any> => {
            return port;
          };

          newTransport = new WebSerialTransport(portFactory, webOptionsIn);
          break;
        }

        default:
          throw new Error(`Unknown transport type: ${info.type}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to create new transport of type "${info.type}": ${err.message}`);
      throw err;
    }

    const deviceTracker = new DeviceConnectionTracker();
    const portTracker = new PortConnectionTracker();

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
  }

  /**
   * Выполняет операцию записи (или любую другую команду, требующую эксклюзивного доступа)
   * на указанном транспорте, используя мьютекс PollingManager.
   * @param transportId - ID транспорта, на котором нужно выполнить запись.
   * @param data - Данные для записи (Uint8Array).
   * @param readLength - Ожидаемая длина ответа (если есть).
   * @param timeout - Таймаут на чтение ответа (в мс).
   * @returns Прочитанный ответ (Uint8Array) или пустой буфер, если readLength=0.
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

  /**
   * Получить транспорт по стратегии round-robin
   */
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
   * Получает статус транспорта по указанному ID.
   * @param id - ID транспорта
   * @returns Статус транспорта или пустой объект, если транспорт не найден
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

  /**
   * Устанавливает стратегию балансировки.
   * @param strategy - Стратегия балансировки ('round-robin', 'sticky', 'first-available')
   */
  setLoadBalancer(strategy: LoadBalancerStrategy): void {
    this.loadBalancerStrategy = strategy;
  }

  /**
   * Устанавливает обработчик состояния устройства для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
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
   * Устанавливает обработчик состояния порта для транспорта.
   * @param transportId - ID транспорта
   * @param handler - Обработчик состояния
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

  /**
   * Внутренний метод: вызывается транспортом при изменении состояния устройства.
   */
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

  /**
   * Внутренний метод: вызывается транспортом при изменении состояния порта.
   */
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
   * Уничтожает контроллер транспорта.
   */
  async destroy(): Promise<void> {
    for (const info of this.transports.values()) {
      info.pollingManager.clearAll();
    }

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

    this.logger.info('TransportController destroyed');
  }
}

export = TransportController;
