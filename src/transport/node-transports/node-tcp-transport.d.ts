import {
  Transport,
  ConnectionErrorType,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
} from '../../types/modbus-types.js';

/**
 * Опции конфигурации для NodeTcpTransport
 */
export interface NodeTcpTransportOptions {
  /** Таймаут ожидания ответа в мс (по умолчанию 2000) */
  readTimeout?: number;
  /** Таймаут записи данных в мс (по умолчанию 2000) */
  writeTimeout?: number;
  /** Максимальный размер внутреннего буфера (по умолчанию 8192) */
  maxBufferSize?: number;
  /** Интервал между попытками переподключения (по умолчанию 3000) */
  reconnectInterval?: number;
  /** Максимальное количество попыток переподключения (по умолчанию Infinity) */
  maxReconnectAttempts?: number;
}

/**
 * Реализация транспорта Modbus TCP для Node.js на базе модуля 'net'
 */
declare class NodeTcpTransport implements Transport {
  /** Указывает, открыто ли соединение в данный момент */
  public isOpen: boolean;

  /**
   * @param host IP-адрес или хостнейм устройства
   * @param port TCP порт (обычно 502)
   * @param options Настройки транспорта
   */
  constructor(host: string, port: number, options?: NodeTcpTransportOptions);

  /** Возвращает режим RS485 (стандартно для TCP-RTU шлюзов) */
  public getRSMode(): RSMode;

  /** Устанавливает обработчик состояния устройств (Slave ID) */
  public setDeviceStateHandler(h: DeviceStateHandler): void;

  /** Устанавливает обработчик состояния TCP порта */
  public setPortStateHandler(h: PortStateHandler): void;

  /** Отключает отслеживание состояния устройств */
  public disableDeviceTracking(): Promise<void>;

  /** Включает отслеживание состояния устройств */
  public enableDeviceTracking(h?: DeviceStateHandler): Promise<void>;

  /** Уведомляет о доступности устройства */
  public notifyDeviceConnected(id: number): void;

  /** Уведомляет о потере связи с устройством */
  public notifyDeviceDisconnected(id: number, type: ConnectionErrorType, msg: string): void;

  /** Устанавливает TCP соединение */
  public connect(): Promise<void>;

  /** Записывает данные в сокет */
  public write(buffer: Uint8Array): Promise<void>;

  /** Читает заданное количество байт из буфера */
  public read(length: number, timeout?: number): Promise<Uint8Array>;

  /** Разрывает соединение и прекращает цикл реконнекта */
  public disconnect(): Promise<void>;

  /** Очищает приемный буфер */
  public flush(): Promise<void>;
}

export = NodeTcpTransport;
