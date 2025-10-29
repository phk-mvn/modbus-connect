/**
 * Трекер состояния подключения устройств (slave-ов) в Modbus-транспорте.
 * Обеспечивает:
 * - Дебонсинг уведомлений об отключении
 * - Централизованное хранение состояний
 * - Восстановление состояния при смене обработчика
 */
export class DeviceConnectionTracker {
  /**
   * Устанавливает обработчик событий изменения состояния устройства.
   * При установке — вызывает обработчик для всех текущих состояний.
   *
   * @param handler Функция-обработчик: (slaveId, connected, error?)
   */
  setHandler(handler: import('../../types/modbus-types.js').DeviceStateHandler): void;

  /**
   * Удаляет обработчик событий изменения состояния устройства.
   * После вызова уведомления прекращаются.
   */
  removeHandler(): void;

  /**
   * Уведомляет о подключении устройства.
   * Игнорируется, если устройство уже в состоянии "подключено".
   *
   * @param slaveId Идентификатор slave-устройства
   */
  notifyConnected(slaveId: number): void;

  /**
   * Уведомляет об отключении устройства с дебонсингом.
   *
   * @param slaveId Идентификатор устройства
   * @param errorType Тип ошибки (по умолчанию: 'UnknownError')
   * @param errorMessage Сообщение об ошибке (по умолчанию: 'Device disconnected')
   */
  notifyDisconnected(slaveId: number, errorType?: string, errorMessage?: string): void;

  /**
   * Возвращает текущее состояние конкретного устройства.
   *
   * @param slaveId Идентификатор устройства
   * @returns Объект состояния или undefined
   */
  getState(
    slaveId: number
  ): import('../../types/modbus-types.js').DeviceConnectionStateObject | undefined;

  /**
   * Возвращает копию всех текущих состояний устройств.
   *
   * @returns Массив объектов состояния
   */
  getAllStates(): import('../../types/modbus-types.js').DeviceConnectionStateObject[];

  /**
   * Очищает все состояния и таймеры дебонса.
   * Используется при закрытии порта или пересоздании транспорта.
   */
  clear(): void;

  /**
   * Внутренний метод для тестирования.
   * Сбрасывает таймер дебонса для конкретного slave.
   * Не предназначен для использования в продакшене.
   *
   * @internal
   * @param slaveId
   */
  __resetDebounce(slaveId: number): void;
}
