// modbus/transport/trackers/PortConnectionTracker.ts

import { Mutex } from 'async-mutex';
import {
  EConnectionErrorType,
  IPortConnectionState,
  IPortConnectionTracker,
  IPortConnectionTrackerOptions,
  TPortStateHandler,
} from '../../types/modbus-types.js';

/**
 * PortConnectionTracker tracks the overall connection state of the physical port
 * (Serial, TCP, etc.) and the list of connected slave devices.
 * Features:
 * - Debounced notifications for disconnection events
 * - Thread-safe operations using mutex
 * - Immutable returned state objects
 * - Automatic cleanup of debounce timers
 * - Support for passing list of active slaveIds
 */
export class PortConnectionTracker implements IPortConnectionTracker {
  private _handler?: TPortStateHandler;
  private _state: IPortConnectionState;
  private readonly _debounceMs: number;
  private readonly _mutex = new Mutex();
  private _debounceTimeout: NodeJS.Timeout | null = null;

  /**
   * Creates a new PortConnectionTracker instance.
   * @param options - Configuration options for the tracker
   * @param options.debounceMs - Debounce interval in ms for disconnection notifications (default: 300)
   */
  constructor(options: IPortConnectionTrackerOptions = {}) {
    this._debounceMs = options.debounceMs ?? 300;
    this._state = {
      isConnected: false,
      slaveIds: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Sets the handler that will be called when the port's connection state changes.
   * When a new handler is set, it is immediately called with the current state.
   * @param handler - Callback function `(isConnected: boolean, slaveIds: number[], error?) => void`
   */
  public async setHandler(handler: TPortStateHandler): Promise<void> {
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
   * Notifies that the port has become connected.
   * If the port is already connected with the same list of slaveIds, the notification is ignored.
   * Any pending disconnection debounce timer is cancelled.
   * @param slaveIds - List of slave IDs currently accessible through this port (default: [])
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

      this._handler?.(true, this._state.slaveIds);
    } finally {
      release();
    }
  }

  /**
   * Notifies that the port has disconnected with trailing debounce.
   * The actual handler call is delayed by `debounceMs`. If another disconnection
   * notification arrives before the timer fires, the previous one is cancelled.
   * @param errorType - Type of disconnection error (default: UnknownError)
   * @param errorMessage - Detailed error message (default: 'Port disconnected')
   * @param slaveIds - List of slave IDs that were active before disconnection (default: [])
   */
  public notifyDisconnected(
    errorType: EConnectionErrorType = EConnectionErrorType.UnknownError,
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
   * Returns a deep copy of the current port connection state.
   */
  public async getState(): Promise<IPortConnectionState> {
    const release = await this._mutex.acquire();
    try {
      return { ...this._state, slaveIds: [...this._state.slaveIds] };
    } finally {
      release();
    }
  }

  /**
   * Clears any pending debounce timer and resets the port state to disconnected.
   * Typically called during destroy or full reset operations.
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
      this._handler = undefined;
    } finally {
      release();
    }
  }

  /**
   * Returns whether the port is currently marked as connected.
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
   * Resets the debounce timer (intended for testing purposes only).
   * @internal
   */
  public __resetDebounce(): void {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
      this._debounceTimeout = null;
    }
  }
}

/**
 * Helper function to compare two number arrays for equality (order-independent).
 */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
