// modbus/transport/trackers/DeviceConnectionTracker.ts

import { Mutex } from 'async-mutex';
import {
  TDeviceStateHandler,
  IDeviceConnectionStateObject,
  IDeviceConnectionTrackerOptions,
  EConnectionErrorType,
  IDeviceConnectionTracker,
} from '../../types/modbus-types';

/**
 * DeviceConnectionTracker tracks the connection state of individual Modbus slave devices.
 * Features:
 * - Debounced notifications for disconnection events (prevents spam during unstable connections)
 * - Thread-safe operations using `async-mutex`
 * - Optional validation of slaveId (1–255)
 * - Immutable returned state objects
 * - Ability to disable the handler completely
 */
export class DeviceConnectionTracker implements IDeviceConnectionTracker {
  private _handler?: TDeviceStateHandler;
  private readonly _states = new Map<number, IDeviceConnectionStateObject>();
  private readonly _debounceMs: number;
  private readonly _validateSlaveId: boolean;
  private readonly _mutex = new Mutex();
  private readonly _debounceTimeouts = new Map<number, NodeJS.Timeout>();

  /**
   * Creates a new DeviceConnectionTracker instance.
   *
   * @param options - Configuration options for the tracker
   * @param options.debounceMs - Debounce interval in milliseconds for disconnection notifications (default: 500)
   * @param options.validateSlaveId - Whether to validate slaveId range (1–255) (default: true)
   */
  constructor(options: IDeviceConnectionTrackerOptions = {}) {
    this._debounceMs = options.debounceMs ?? 500;
    this._validateSlaveId = options.validateSlaveId ?? true;
  }

  /**
   * Sets the handler that will be called when a device's connection state changes.
   * When a new handler is set, it is immediately invoked for all currently tracked devices
   * to ensure the consumer has the latest state.
   * @param handler - Callback function `(slaveId: number, connected: boolean, error?) => void`
   */
  public async setHandler(handler: TDeviceStateHandler): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      this._handler = handler;
      for (const state of this._states.values()) {
        handler(
          state.slaveId,
          state.hasConnectionDevice,
          state.hasConnectionDevice
            ? undefined
            : {
                type: state.errorType as EConnectionErrorType, // Приведение к типу
                message: state.errorMessage || 'Unknown error',
              }
        );
      }
    } finally {
      release();
    }
  }

  /**
   * Removes the current state change handler.
   * After calling this method, no further notifications will be sent.
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
   * Notifies the tracker that a device has become connected.
   * If the device is already marked as connected, the notification is ignored.
   * Any pending debounce timer for disconnection is cancelled.
   * @param slaveId - Slave identifier (1–255)
   */
  public async notifyConnected(slaveId: number): Promise<void> {
    if (this._validateSlaveId && (slaveId < 1 || slaveId > 255)) return;

    const release = await this._mutex.acquire();
    try {
      // Cancel any pending disconnection debounce
      const existingTimeout = this._debounceTimeouts.get(slaveId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this._debounceTimeouts.delete(slaveId);
      }

      const existing = this._states.get(slaveId);
      if (existing?.hasConnectionDevice) {
        return;
      }

      const state: IDeviceConnectionStateObject = {
        slaveId,
        hasConnectionDevice: true,
      };

      this._states.set(slaveId, state);

      this._handler?.(slaveId, true);
    } finally {
      release();
    }
  }

  /**
   * Notifies the tracker that a device has disconnected with trailing debounce.
   * The actual notification is delayed by `debounceMs`. If another `notifyDisconnected`
   * is called for the same slaveId before the timer fires, the previous timer is cancelled.
   * @param slaveId - Slave identifier (1–255)
   * @param errorType - Type of disconnection error (default: UnknownError)
   * @param errorMessage - Detailed error message (default: 'Device disconnected')
   */
  public notifyDisconnected(
    slaveId: number,
    errorType: EConnectionErrorType = EConnectionErrorType.UnknownError,
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
   * Completely removes a device's state from the tracker.
   * This is a synchronous method used when a device is forcibly removed from configuration.
   * Ensures that the next `notifyConnected` will trigger a fresh notification.
   * @param slaveId - Slave identifier (1–255)
   */
  public removeState(slaveId: number): void {
    const existingTimeout = this._debounceTimeouts.get(slaveId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this._debounceTimeouts.delete(slaveId);
    }
    this._states.delete(slaveId);
  }

  /**
   * Performs the actual disconnection notification (internal method).
   */
  private async _doNotifyDisconnected(
    slaveId: number,
    errorType: EConnectionErrorType,
    errorMessage: string
  ): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      const existing = this._states.get(slaveId);

      if (existing && !existing.hasConnectionDevice && existing.errorType === errorType) {
        return;
      }

      const newState: IDeviceConnectionStateObject = {
        slaveId,
        hasConnectionDevice: false,
        errorType,
        errorMessage,
      };

      this._states.set(slaveId, newState);
      this._handler?.(slaveId, false, { type: errorType, message: errorMessage });
    } finally {
      release();
    }
  }

  /**
   * Returns a shallow copy of the current state for a specific slave.
   * @param slaveId - Slave identifier
   * @returns Device state object or undefined if not tracked
   */
  public async getState(slaveId: number): Promise<IDeviceConnectionStateObject | undefined> {
    const release = await this._mutex.acquire();
    try {
      const state = this._states.get(slaveId);
      return state ? { ...state } : undefined;
    } finally {
      release();
    }
  }

  /**
   * Returns a deep copy of all currently tracked device states.
   */
  public async getAllStates(): Promise<IDeviceConnectionStateObject[]> {
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
   * Clears all tracked states and cancels any pending debounce timers.
   * Also removes the current handler.
   */
  public async clear(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      for (const timeout of this._debounceTimeouts.values()) {
        clearTimeout(timeout);
      }
      this._debounceTimeouts.clear();

      this._states.clear();
      this._handler = undefined;
    } finally {
      release();
    }
  }

  /**
   * Checks whether a specific slave is being tracked.
   */
  public hasState(slaveId: number): boolean {
    return this._states.has(slaveId);
  }

  /**
   * Returns an array of all slaveIds that are currently marked as connected.
   */
  public getConnectedSlaveIds(): number[] {
    return Array.from(this._states.entries())
      .filter(([, s]) => s.hasConnectionDevice)
      .map(([id]) => id);
  }

  /**
   * Resets the debounce timer for a specific slave (intended for testing only).
   * @internal
   */
  public __resetDebounce(slaveId: number): void {
    const timeout = this._debounceTimeouts.get(slaveId);
    if (timeout) clearTimeout(timeout);
    this._debounceTimeouts.delete(slaveId);
  }
}
