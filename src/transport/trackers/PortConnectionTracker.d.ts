import { ConnectionErrorType } from '../../types/modbus-types.js';

/**
 * Состояние подключения физического порта (Serial, TCP и т.д.).
 */
export interface PortConnectionState {
  /** Порт открыт и готов к работе */
  isConnected: boolean;
  /** Тип последней ошибки (если отключён) */
  errorType?: ConnectionErrorType;
  /** Подробное сообщение об ошибке */
  errorMessage?: string;
  /** Время последнего изменения состояния (ms) */
  timestamp: number;
}

/**
 * Обработчик изменения состояния порта.
 *
 * @param connected   true – порт подключён, false – отключён
 * @param error       Объект ошибки, если порт отключён
 */
export type PortStateHandler = (
  connected: boolean,
  error?: { type: ConnectionErrorType; message: string }
) => void;

/**
 * Настройки PortConnectionTracker.
 */
export interface PortConnectionTrackerOptions {
  /**
   * Интервал дебонса уведомлений об отключении (мс).
   * По умолчанию: `300`.
   */
  debounceMs?: number;
}

/**
 * Отслеживает состояние подключения физического порта.
 *
 * - Дебонс уведомлений об отключении (trailing debounce)
 * - Потокобезопасность через `async‑mutex`
 * - Иммутабельные возвращаемые данные
 * - Автоматическая отмена таймеров
 */
export declare class PortConnectionTracker {
  /**
   * @param options Настройки трекера
   */
  constructor(options?: PortConnectionTrackerOptions);

  /**
   * Устанавливает обработчик изменения состояния порта.
   * При установке сразу вызывается с текущим состоянием.
   */
  setHandler(handler: PortStateHandler): Promise<void>;

  /**
   * Уведомляет о подключении порта.
   * Игнорируется, если порт уже подключён.
   */
  notifyConnected(): Promise<void>;

  /**
   * Уведомляет об отключении порта с trailing debounce.
   *
   * @param errorType   Тип ошибки (по умолчанию `UnknownError`)
   * @param errorMessage Подробное сообщение (по умолчанию `'Port disconnected'`)
   */
  notifyDisconnected(errorType?: ConnectionErrorType, errorMessage?: string): void;

  /**
   * Возвращает **копию** текущего состояния порта.
   */
  getState(): Promise<PortConnectionState>;

  /**
   * Очищает таймер дебонса и сбрасывает состояние.
   */
  clear(): Promise<void>;

  /**
   * Проверяет, подключён ли порт в данный момент.
   */
  isConnected(): Promise<boolean>;

  /**
   * Сбрасывает таймер дебонса (используется только в тестах).
   * @internal
   */
  __resetDebounce(): void;
}
