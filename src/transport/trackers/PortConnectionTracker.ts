// src/transport/trackers/PortConnectionTracker.ts

import { Mutex } from 'async-mutex';
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
export class PortConnectionTracker {
  private _handler?: PortStateHandler;
  private _state: PortConnectionState;
  private readonly _debounceMs: number;
  private readonly _mutex = new Mutex();
  private _debounceTimeout: NodeJS.Timeout | null = null;

  constructor(options: PortConnectionTrackerOptions = {}) {
    this._debounceMs = options.debounceMs ?? 300;
    this._state = {
      isConnected: false,
      slaveIds: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Устанавливает обработчик изменения состояния порта.
   * При установке — вызывает обработчик с текущим состоянием.
   */
  public async setHandler(handler: PortStateHandler): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      this._handler = handler;
      handler(
        this._state.isConnected,
        this._state.slaveIds,
        this._state.isConnected
          ? undefined
          : { type: this._state.errorType!, message: this._state.errorMessage! }
      );
    } finally {
      release();
    }
  }

  /**
   * Уведомляет о подключении порта.
   * Игнорируется, если порт уже подключён.
   * @param slaveIds — список slaveId, подключённых к порту
   */
  public async notifyConnected(slaveIds: number[] = []): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      if (this._debounceTimeout) {
        clearTimeout(this._debounceTimeout);
        this._debounceTimeout = null;
      }

      if (this._state.isConnected && arraysEqual(this._state.slaveIds, slaveIds)) {
        return;
      }

      this._state = {
        isConnected: true,
        slaveIds: [...slaveIds],
        timestamp: Date.now(),
      };

      // Немедленно отправляем уведомление
      this._handler?.(true, this._state.slaveIds);
    } finally {
      release();
    }
  }

  /**
   * Уведомляет об отключении порта с trailing debounce.
   * Последний вызов в серии будет выполнен через `debounceMs`.
   * @param errorType Тип ошибки, по умолчанию: `ConnectionErrorType.UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Port disconnected'`
   * @param slaveIds Список slaveId, которые были активны
   */
  public notifyDisconnected(
    errorType: ConnectionErrorType = ConnectionErrorType.UnknownError,
    errorMessage: string = 'Port disconnected',
    slaveIds: number[] = []
  ): void {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }

    (async () => {
      const release = await this._mutex.acquire();
      try {
        if (!this._state.isConnected) {
          return;
        }

        this._state = {
          isConnected: false,
          errorType,
          errorMessage,
          slaveIds: [...slaveIds],
          timestamp: Date.now(),
        };

        this._debounceTimeout = setTimeout(() => {
          this._debounceTimeout = null;
          this._handler?.(false, this._state.slaveIds, { type: errorType, message: errorMessage });
        }, this._debounceMs);
      } finally {
        release();
      }
    })();
  }

  /**
   * Возвращает копию текущего состояния порта.
   */
  public async getState(): Promise<PortConnectionState> {
    const release = await this._mutex.acquire();
    try {
      return { ...this._state, slaveIds: [...this._state.slaveIds] };
    } finally {
      release();
    }
  }

  /**
   * Очищает таймер дебонса и сбрасывает состояние.
   * Вызывается при `destroy()` или полном сбросе.
   */
  public async clear(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      if (this._debounceTimeout) {
        clearTimeout(this._debounceTimeout);
        this._debounceTimeout = null;
      }
      this._state = {
        isConnected: false,
        slaveIds: [],
        timestamp: Date.now(),
      };
    } finally {
      release();
    }
  }

  /**
   * Проверяет, подключён ли порт.
   */
  public async isConnected(): Promise<boolean> {
    const release = await this._mutex.acquire();
    try {
      return this._state.isConnected;
    } finally {
      release();
    }
  }

  /**
   * Сбрасывает таймер дебонса (только для тестов).
   * @internal
   */
  public __resetDebounce(): void {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
      this._debounceTimeout = null;
    }
  }
}

// Утилита для сравнения массивов
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
