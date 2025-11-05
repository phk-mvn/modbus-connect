// src/transport/trackers/DeviceConnectionTracker.d.ts

import {
  DeviceStateHandler,
  DeviceConnectionStateObject,
  DeviceConnectionTrackerOptions,
  ConnectionErrorType,
} from '../../types/modbus-types.js';

/**
 * Отслеживает состояние подключения Modbus-устройств (slave).
 * Поддерживает:
 * - Уведомления с debounce
 * - Потокобезопасность через `async-mutex`
 * - Валидацию `slaveId` (1–255)
 * - Иммутабельные возвращаемые данные
 * - Отключение обработчика
 */
export declare class DeviceConnectionTracker {
  /**
   * Создаёт экземпляр трекера состояний.
   *
   * @param options Настройки трекера
   */
  constructor(options?: DeviceConnectionTrackerOptions);

  /**
   * Устанавливает обработчик изменения состояния устройства.
   * При установке — вызывает обработчик для всех текущих состояний.
   *
   * @param handler Функция: `(slaveId: number, connected: boolean, error?) => void`
   */
  setHandler(handler: DeviceStateHandler): Promise<void>;

  /**
   * Удаляет обработчик изменения состояния.
   * После вызова — уведомления прекращаются.
   */
  removeHandler(): Promise<void>;

  /**
   * Уведомляет о подключении устройства.
   * Игнорируется, если устройство уже подключено.
   *
   * @param slaveId Идентификатор устройства (1–255)
   */
  notifyConnected(slaveId: number): Promise<void>;

  /**
   * Уведомляет об отключении устройства с **trailing debounce**.
   * Последний вызов в серии будет выполнен через `debounceMs`.
   *
   * @param slaveId Идентификатор устройства (1–255)
   * @param errorType Тип ошибки, по умолчанию: `UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Device disconnected'`
   */
  notifyDisconnected(slaveId: number, errorType?: ConnectionErrorType, errorMessage?: string): void;

  /**
   * Возвращает копию состояния конкретного устройства.
   */
  getState(slaveId: number): Promise<DeviceConnectionStateObject | undefined>;

  /**
   * Возвращает копии всех текущих состояний устройств.
   */
  getAllStates(): Promise<DeviceConnectionStateObject[]>;

  /**
   * Очищает все состояния и отменяет все таймеры дебонса.
   */
  clear(): Promise<void>;

  /**
   * Проверяет, отслеживается ли устройство.
   */
  hasState(slaveId: number): boolean;

  /**
   * Возвращает список `slaveId` всех подключённых устройств.
   */
  getConnectedSlaveIds(): number[];

  /**
   * Сбрасывает таймер дебонса для указанного устройства.
   * **Только для тестов.**
   *
   * @internal
   */
  __resetDebounce(slaveId: number): void;
}
