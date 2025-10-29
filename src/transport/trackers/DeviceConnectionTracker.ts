// src/transport/trackers/DeviceConnectionTracker.ts

import { Mutex } from 'async-mutex';
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
export class DeviceConnectionTracker {
  private _handler?: DeviceStateHandler;
  private readonly _states = new Map<number, DeviceConnectionStateObject>();
  private readonly _debounceMs: number;
  private readonly _validateSlaveId: boolean;
  private readonly _mutex = new Mutex();
  private readonly _debounceTimeouts = new Map<number, NodeJS.Timeout>();

  /**
   * Создаёт экземпляр трекера состояний.
   *
   * @param options Настройки трекера
   * @param options.debounceMs Интервал дебонса уведомлений об отключении (мс), по умолчанию: `500`
   * @param options.validateSlaveId Валидировать `slaveId` (1–255), по умолчанию: `true`
   */
  constructor(options: DeviceConnectionTrackerOptions = {}) {
    this._debounceMs = options.debounceMs ?? 500;
    this._validateSlaveId = options.validateSlaveId ?? true;
  }

  /**
   * Устанавливает обработчик изменения состояния устройства.
   * При установке — вызывает обработчик для всех текущих состояний.
   *
   * @param handler Функция: `(slaveId: number, connected: boolean, error?) => void`
   */
  public async setHandler(handler: DeviceStateHandler): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      this._handler = handler;
      for (const state of this._states.values()) {
        handler(
          state.slaveId,
          state.hasConnectionDevice,
          state.hasConnectionDevice
            ? undefined
            : { type: state.errorType!, message: state.errorMessage! }
        );
      }
    } finally {
      release();
    }
  }

  /**
   * Удаляет обработчик изменения состояния.
   * После вызова — уведомления прекращаются.
   */
  public async removeHandler(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      this._handler = undefined;
    } finally {
      release();
    }
  }

  /**
   * Уведомляет о подключении устройства.
   * Игнорируется, если устройство уже подключено.
   *
   * @param slaveId Идентификатор устройства (1–255)
   */
  public async notifyConnected(slaveId: number): Promise<void> {
    if (this._validateSlaveId && (slaveId < 1 || slaveId > 255)) return;

    const release = await this._mutex.acquire();
    try {
      const existing = this._states.get(slaveId);
      if (existing?.hasConnectionDevice) return;

      const state: DeviceConnectionStateObject = {
        slaveId,
        hasConnectionDevice: true,
      };

      this._states.set(slaveId, state);
      this._debounceTimeouts.delete(slaveId);
      this._handler?.(slaveId, true);
    } finally {
      release();
    }
  }

  /**
   * Уведомляет об отключении устройства с **trailing debounce**.
   * Последний вызов в серии будет выполнен через `debounceMs`.
   *
   * @param slaveId Идентификатор устройства (1–255)
   * @param errorType Тип ошибки, по умолчанию: `UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Device disconnected'`
   */
  public notifyDisconnected(
    slaveId: number,
    errorType: ConnectionErrorType = ConnectionErrorType.UnknownError,
    errorMessage: string = 'Device disconnected'
  ): void {
    if (this._validateSlaveId && (slaveId < 1 || slaveId > 255)) return;

    const existingTimeout = this._debounceTimeouts.get(slaveId);
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeout = setTimeout(() => {
      this._debounceTimeouts.delete(slaveId);
      this._doNotifyDisconnected(slaveId, errorType, errorMessage);
    }, this._debounceMs);

    this._debounceTimeouts.set(slaveId, timeout);
  }

  /**
   * Выполняет фактическое уведомление об отключении (внутренний метод).
   */
  private async _doNotifyDisconnected(
    slaveId: number,
    errorType: ConnectionErrorType,
    errorMessage: string
  ): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      const existing = this._states.get(slaveId);
      if (!existing || existing.hasConnectionDevice) {
        const state: DeviceConnectionStateObject = {
          slaveId,
          hasConnectionDevice: false,
          errorType,
          errorMessage,
        };
        this._states.set(slaveId, state);
        this._handler?.(slaveId, false, { type: errorType, message: errorMessage });
      }
    } finally {
      release();
    }
  }

  /**
   * Возвращает копию состояния конкретного устройства.
   */
  public async getState(slaveId: number): Promise<DeviceConnectionStateObject | undefined> {
    const release = await this._mutex.acquire();
    try {
      const state = this._states.get(slaveId);
      return state ? { ...state } : undefined;
    } finally {
      release();
    }
  }

  /**
   * Возвращает копии всех текущих состояний устройств.
   */
  public async getAllStates(): Promise<DeviceConnectionStateObject[]> {
    const release = await this._mutex.acquire();
    try {
      return Array.from(
        this._states.values(),
        ({ slaveId, hasConnectionDevice, errorType, errorMessage }) => ({
          slaveId,
          hasConnectionDevice,
          errorType,
          errorMessage,
        })
      );
    } finally {
      release();
    }
  }

  /**
   * Очищает все состояния и отменяет все таймеры дебонса.
   */
  public async clear(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      this._states.clear();
      this._debounceTimeouts.forEach(clearTimeout);
      this._debounceTimeouts.clear();
      this._handler = undefined;
    } finally {
      release();
    }
  }

  /**
   * Проверяет, отслеживается ли устройство.
   */
  public hasState(slaveId: number): boolean {
    return this._states.has(slaveId);
  }

  /**
   * Возвращает список `slaveId` всех подключённых устройств.
   */
  public getConnectedSlaveIds(): number[] {
    return Array.from(this._states.entries())
      .filter(([, s]) => s.hasConnectionDevice)
      .map(([id]) => id);
  }

  /**
   * Сбрасывает таймер дебонса для указанного устройства.
   * **Только для тестов.**
   *
   * @internal
   */
  public __resetDebounce(slaveId: number): void {
    const timeout = this._debounceTimeouts.get(slaveId);
    if (timeout) clearTimeout(timeout);
    this._debounceTimeouts.delete(slaveId);
  }
}
