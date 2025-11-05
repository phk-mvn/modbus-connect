// src/transport/trackers/PortConnectionTracker.d.ts

import { ConnectionErrorType, PortStateHandler } from '../../types/modbus-types.js';

/**
 * Состояние подключения физического порта
 */
export interface PortConnectionState {
  /** Порт открыт и готов к работе */
  isConnected: boolean;
  /** Тип последней ошибки (если отключён) */
  errorType?: ConnectionErrorType;
  /** Подробное сообщение об ошибке */
  errorMessage?: string;
  /** Список slaveId, подключённых к порту */
  slaveIds: number[];
  /** Время последнего изменения состояния (ms) */
  timestamp: number;
}

/**
 * Опции для PortConnectionTracker
 */
export interface PortConnectionTrackerOptions {
  /** Интервал дебонса уведомлений об отключении (мс), по умолчанию: 300 */
  debounceMs?: number;
}

/**
 * Отслеживает состояние подключения физического порта (Serial, TCP и т.д.).
 * Поддерживает:
 * - Дебонс уведомлений об отключении
 * - Потокобезопасность
 * - Иммутабельные возвращаемые данные
 * - Автоматическая отмена таймеров
 * - Передачу списка slaveIds
 */
export declare class PortConnectionTracker {
  /**
   * @param options Настройки трекера
   */
  constructor(options?: PortConnectionTrackerOptions);

  /**
   * Устанавливает обработчик изменения состояния порта.
   * При установке — вызывает обработчик с текущим состоянием.
   */
  setHandler(handler: PortStateHandler): Promise<void>;

  /**
   * Уведомляет о подключении порта.
   * Игнорируется, если порт уже подключён.
   * @param slaveIds — список slaveId, подключённых к порту
   */
  notifyConnected(slaveIds?: number[]): Promise<void>;

  /**
   * Уведомляет об отключении порта с trailing debounce.
   *
   * @param errorType Тип ошибки, по умолчанию: `ConnectionErrorType.UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Port disconnected'`
   * @param slaveIds Список slaveId, которые были активны
   */
  notifyDisconnected(
    errorType?: ConnectionErrorType,
    errorMessage?: string,
    slaveIds?: number[]
  ): void;

  /**
   * Возвращает копию текущего состояния порта.
   */
  getState(): Promise<PortConnectionState>;

  /**
   * Очищает таймер дебонса и сбрасывает состояние.
   * Вызывается при `destroy()` или полном сбросе.
   */
  clear(): Promise<void>;

  /**
   * Проверяет, подключён ли порт.
   */
  isConnected(): Promise<boolean>;

  /**
   * Сбрасывает таймер дебонса (только для тестов).
   * @internal
   */
  __resetDebounce(): void;
}
