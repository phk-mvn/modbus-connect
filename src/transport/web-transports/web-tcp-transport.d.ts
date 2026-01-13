import {
  Transport,
  ConnectionErrorType,
  DeviceStateHandler,
  PortStateHandler,
  RSMode,
} from '../../types/modbus-types.js';

/**
 * Опции конфигурации для WebTcpTransport
 */
export interface WebTcpTransportOptions {
  /** Таймаут чтения данных в мс (по умолчанию 2000) */
  readTimeout?: number;
  /** Таймаут записи данных в мс (по умолчанию 2000) */
  writeTimeout?: number;
  /** Максимальный размер буфера в байтах (по умолчанию 8192) */
  maxBufferSize?: number;
  /** Интервал между попытками переподключения в мс (по умолчанию 3000) */
  reconnectInterval?: number;
  /** Максимальное количество попыток переподключения (по умолчанию Infinity) */
  maxReconnectAttempts?: number;
}

/**
 * Реализация транспорта Modbus через WebSocket (для браузеров)
 * Используется как прокси для TCP соединений
 */
declare class WebTcpTransport implements Transport {
  /** Флаг активного состояния WebSocket соединения */
  public isOpen: boolean;

  /**
   * @param url URL WebSocket сервера (например, 'ws://localhost:8080')
   * @param options Настройки транспорта
   */
  constructor(url: string, options?: WebTcpTransportOptions);

  /** Возвращает режим работы RS (всегда 'RS485') */
  public getRSMode(): RSMode;

  /** Устанавливает обработчик состояния устройств */
  public setDeviceStateHandler(handler: DeviceStateHandler): void;

  /** Устанавливает обработчик состояния порта */
  public setPortStateHandler(handler: PortStateHandler): void;

  /** Отключает отслеживание состояния устройств */
  public disableDeviceTracking(): Promise<void>;

  /** Включает отслеживание состояния устройств */
  public enableDeviceTracking(handler?: DeviceStateHandler): Promise<void>;

  /** Уведомляет транспорт о том, что устройство на линии ответило */
  public notifyDeviceConnected(slaveId: number): void;

  /** Уведомляет транспорт о потере связи с конкретным устройством */
  public notifyDeviceDisconnected(
    slaveId: number,
    errorType: ConnectionErrorType,
    errorMessage: string
  ): void;

  /** Открывает WebSocket соединение */
  public connect(): Promise<void>;

  /** Отправляет данные через WebSocket */
  public write(buffer: Uint8Array): Promise<void>;

  /**
   * Читает заданное количество байт из буфера.
   * Ожидает данные до наступления таймаута.
   */
  public read(length: number, timeout?: number): Promise<Uint8Array>;

  /** Закрывает WebSocket соединение и останавливает переподключение */
  public disconnect(): Promise<void>;

  /** Очищает внутренний буфер чтения */
  public flush(): Promise<void>;
}

export default WebTcpTransport;
