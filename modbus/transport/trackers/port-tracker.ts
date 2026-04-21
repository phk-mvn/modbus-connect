// modbus/transport/trackers/port-tracker.ts

import { Mutex } from 'async-mutex';
import { EConnectionErrorType, TPortStateHandler } from '../../types/public.js';
import {
  IPortConnectionState,
  IPortConnectionTracker,
  IPortConnectionTrackerOptions,
} from '../../types/internal.js';

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
    let connected: boolean;
    let slaves: number[];
    let error: { type: EConnectionErrorType; message: string } | undefined;

    await this._mutex.runExclusive(async () => {
      this._handler = handler;
      connected = this._state.isConnected;
      slaves = [...this._state.slaveIds];
      if (!connected && this._state.errorType) {
        error = { type: this._state.errorType, message: this._state.errorMessage! };
      }
    });

    try {
      handler(connected!, slaves!, error as any);
    } catch (e) {
      console.error('[PortConnectionTracker] Error in initial handler:', e);
    }
  }

  /**
   * Notifies that the port has become connected.
   * If the port is already connected with the same list of slaveIds, the notification is ignored.
   * Any pending disconnection debounce timer is cancelled.
   * @param slaveIds - List of slave IDs currently accessible through this port (default: [])
   */
  public async notifyConnected(slaveIds: number[] = []): Promise<void> {
    let handlerToCall: TPortStateHandler | undefined;
    let currentSlaves: number[] = [];

    await this._mutex.runExclusive(async () => {
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

      handlerToCall = this._handler;
      currentSlaves = [...this._state.slaveIds];
    });

    if (handlerToCall) {
      try {
        handlerToCall(true, currentSlaves);
      } catch (e) {
        console.error('[PortConnectionTracker] Error in handler (connected):', e);
      }
    }
  }

  /**
   * Notifies that the port has disconnected with trailing debounce.
   * The actual notification is delayed by `debounceMs`. If another disconnection
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

    this._debounceTimeout = setTimeout(() => {
      this._debounceTimeout = null;
      this._doNotifyDisconnected(errorType, errorMessage, slaveIds);
    }, this._debounceMs);
  }

  /**
   * Performs the actual disconnection state update and notification.
   * Internal method called by the debounce timer.
   * @private
   */
  private async _doNotifyDisconnected(
    errorType: EConnectionErrorType,
    errorMessage: string,
    slaveIds: number[]
  ): Promise<void> {
    let handlerToCall: TPortStateHandler | undefined;
    let currentSlaves: number[] = [];

    await this._mutex.runExclusive(async () => {
      if (this._debounceTimeout) return;
      if (!this._state.isConnected) return;

      this._state = {
        isConnected: false,
        errorType,
        errorMessage,
        slaveIds: [...slaveIds],
        timestamp: Date.now(),
      };

      handlerToCall = this._handler;
      currentSlaves = [...this._state.slaveIds];
    });

    if (handlerToCall) {
      try {
        handlerToCall(false, currentSlaves, { type: errorType, message: errorMessage });
      } catch (e) {
        console.error('[PortConnectionTracker] Error in handler (disconnected):', e);
      }
    }
  }

  /**
   * Returns a deep copy of the current port connection state.
   * Thread-safe access via mutex.
   * @returns Promise resolving to the current state object.
   */
  public async getState(): Promise<IPortConnectionState> {
    return await this._mutex.runExclusive(async () => {
      return { ...this._state, slaveIds: [...this._state.slaveIds] };
    });
  }

  /**
   * Clears any pending debounce timer and resets the port state to disconnected.
   * Typically called during destroy or full reset operations.
   * @returns Promise that resolves when the clear operation is complete.
   */
  public async clear(): Promise<void> {
    await this._mutex.runExclusive(async () => {
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
    });
  }

  /**
   * Returns whether the port is currently marked as connected.
   * Thread-safe access via mutex.
   * @returns Promise resolving to true if connected, false otherwise.
   */
  public async isConnected(): Promise<boolean> {
    return await this._mutex.runExclusive(async () => {
      return this._state.isConnected;
    });
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
 * @param a - First array of numbers.
 * @param b - Second array of numbers.
 * @returns True if arrays contain the same elements, false otherwise.
 */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
