// src/transport/web-transports/web-serialport.d.ts

import {
  Transport,
  WebSerialPort,
  WebSerialTransportOptions,
  DeviceStateHandler,
  PortStateHandler,
  ConnectionErrorType,
  DeviceConnectionStateObject,
} from '../../types/modbus-types.js';

/**
 * Транспорт для работы с Modbus через Web Serial API.
 *
 * Особенности:
 * - Автоматический реконнект
 * - Трекинг состояния порта и устройств
 * - Дебонс отключений
 * - Потокобезопасность
 * - Поддержка отключения трекинга устройств
 */
declare class WebSerialTransport implements Transport {
  /**
   * @param portFactory Фабрика, возвращающая экземпляр Web Serial Port
   * @param options Настройки транспорта
   */
  constructor(portFactory: () => Promise<WebSerialPort>, options?: WebSerialTransportOptions);

  // === Основные методы транспорта ===
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  destroy(): void;

  // === Обработчики состояния ===
  /**
   * Установить обработчик изменения состояния устройства (slave).
   * Вызывается при подключении/отключении каждого устройства.
   */
  setDeviceStateHandler(handler: DeviceStateHandler): void;

  /**
   * Установить обработчик изменения состояния физического порта.
   */
  setPortStateHandler(handler: PortStateHandler): void;

  // === Управление трекингом устройств ===
  /**
   * Отключить уведомления о состоянии устройств.
   * После вызова `setDeviceStateHandler` перестанет работать.
   */
  disableDeviceTracking(): Promise<void>;

  /**
   * Включить трекинг устройств (если был отключён).
   * @param handler Опционально: установить новый обработчик сразу
   */
  enableDeviceTracking(handler?: DeviceStateHandler): Promise<void>;

  // === Внутренние уведомления (для ModbusClient) ===
  /**
   * Уведомить транспорт о подключении устройства.
   * Используется ModbusClient при успешном ответе.
   */
  notifyDeviceConnected(slaveId: number): void;

  /**
   * Уведомить транспорт об отключении устройства.
   * Используется при таймаутах, ошибках и т.д.
   */
  notifyDeviceDisconnected(
    slaveId: number,
    errorType?: ConnectionErrorType,
    errorMessage?: string
  ): void;

  // === Состояние порта ===
  /**
   * @returns `true`, если порт открыт и готов к операциям
   */
  isPortReady(): boolean;
}

// === Экспорт типов ===
export {
  WebSerialTransport,
  WebSerialTransportOptions,
  WebSerialPort,
  DeviceConnectionStateObject,
  DeviceStateHandler,
  PortStateHandler,
  ConnectionErrorType,
};
