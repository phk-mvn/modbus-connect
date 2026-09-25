// modbus/transport/controller/state/StateManager.ts

import { Mutex } from 'async-mutex';
import { DeviceConnectionTracker } from '../../trackers/device-tracker.js';
import type { PortConnectionTracker } from '../../trackers/port-tracker.js';
import type {
  TDeviceStateHandler,
  TPortStateHandler,
  EConnectionErrorType,
} from '../../../types/public.js';

/**
 * Interface for the State Manager.
 *
 * Since the port tracker now lives inside the port session (PortSession owns it),
 * the port-level methods take the tracker instance explicitly. The StateManager only
 * aggregates: it keeps the device trackers and fans events out to the global handlers.
 */
export interface IStateManager {
  setDeviceHandler(handler: TDeviceStateHandler): void;
  setDeviceHandlerForTransport(transportId: string, handler: TDeviceStateHandler): Promise<void>;
  notifyDeviceConnected(transportId: string, slaveId: number): Promise<void>;
  notifyDeviceDisconnected(
    transportId: string,
    slaveId: number,
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void>;

  setPortHandler(handler: TPortStateHandler): void;
  setPortTrackerHandler(tracker: PortConnectionTracker, handler: TPortStateHandler): Promise<void>;
  notifyPortConnected(tracker: PortConnectionTracker, slaveIds: number[]): Promise<void>;
  notifyPortDisconnected(
    tracker: PortConnectionTracker,
    slaveIds: number[],
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void>;

  createDeviceTrackerForTransport(transportId: string): void;
  clearTransport(transportId: string): Promise<void>;
  removeDeviceState(slaveId: number, transportId?: string): void;
}

/**
 * Manages connection states and event propagation for devices (Slave IDs).
 * It aggregates per-transport device trackers into the global state handlers.
 */
export class StateManager implements IStateManager {
  private readonly _mutex = new Mutex();

  private _globalDeviceHandler: TDeviceStateHandler | null = null;
  private _globalPortHandler: TPortStateHandler | null = null;

  private readonly _deviceTrackers = new Map<string, DeviceConnectionTracker>();
  private readonly _deviceHandlers = new Map<string, TDeviceStateHandler>();

  /**
   * Initializes the device tracker for a newly created transport.
   * @param {string} transportId - The transport identifier.
   */
  public createDeviceTrackerForTransport(transportId: string): void {
    const oldDeviceTracker = this._deviceTrackers.get(transportId);
    if (oldDeviceTracker)
      oldDeviceTracker
        .clear()
        .catch(e => console.error('[StateManager] Error clearing old device tracker:', e));

    this._deviceTrackers.set(transportId, new DeviceConnectionTracker());
  }

  /**
   * Sets a global handler that will be called whenever ANY device state changes.
   * @param {TDeviceStateHandler} handler - Callback for device state events.
   */
  public setDeviceHandler(handler: TDeviceStateHandler): void {
    this._globalDeviceHandler = handler;
  }

  /**
   * Sets a specific handler for a single transport's device events.
   * @param {string} transportId - Target transport ID.
   * @param {TDeviceStateHandler} handler - Callback for events from this transport.
   */
  public async setDeviceHandlerForTransport(
    transportId: string,
    handler: TDeviceStateHandler
  ): Promise<void> {
    const tracker = this._deviceTrackers.get(transportId);
    if (!tracker) {
      throw new Error(`No device tracker for transport "${transportId}"`);
    }
    await tracker.setHandler(handler);
    this._deviceHandlers.set(transportId, handler);
  }

  /**
   * Triggers a 'connected' state event for a specific Slave ID on a transport.
   * @param {string} transportId - The transport where the device was found.
   * @param {number} slaveId - The Slave ID.
   */
  public async notifyDeviceConnected(transportId: string, slaveId: number): Promise<void> {
    const tracker = this._deviceTrackers.get(transportId);
    if (tracker) {
      await tracker.notifyConnected(slaveId);
    }

    this._emitDeviceState(slaveId, true, undefined);
  }

  /**
   * Triggers a 'disconnected' state event for a specific Slave ID.
   * @param {string} transportId - Originating transport.
   * @param {number} slaveId - The Slave ID.
   * @param {EConnectionErrorType} errorType - Reason for disconnection.
   * @param {string} message - Descriptive error message.
   */
  public async notifyDeviceDisconnected(
    transportId: string,
    slaveId: number,
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void> {
    const tracker = this._deviceTrackers.get(transportId);
    if (tracker) {
      tracker.notifyDisconnected(slaveId, errorType, message);
    }

    this._emitDeviceState(slaveId, false, { type: errorType, message });
  }

  /**
   * Sets a global handler for port/transport connection status changes.
   * @param {TPortStateHandler} handler - Callback for port state events.
   */
  public setPortHandler(handler: TPortStateHandler): void {
    this._globalPortHandler = handler;
  }

  /**
   * Registers a per-transport port handler on the tracker owned by the port session.
   * @param {PortConnectionTracker} tracker - Tracker owned by the port session.
   * @param {TPortStateHandler} handler - Callback for events from this port.
   */
  public async setPortTrackerHandler(
    tracker: PortConnectionTracker,
    handler: TPortStateHandler
  ): Promise<void> {
    await tracker.setHandler(handler);
  }

  /**
   * Notifies that a port (transport) has been connected.
   * @param tracker The PortConnectionTracker instance for the port session.
   * @param slaveIds The list of Slave IDs that are currently connected on this port.
   * @returns {Promise<void>} A promise that resolves when the notification has been processed.
   */
  public async notifyPortConnected(
    tracker: PortConnectionTracker,
    slaveIds: number[]
  ): Promise<void> {
    await tracker.notifyConnected(slaveIds);
    this._emitPortState(true, slaveIds, undefined);
  }

  /**
   * Notifies that a port (transport) has been disconnected.
   * @param tracker The PortConnectionTracker instance for the port session.
   * @param slaveIds The list of Slave IDs that were connected on this port before disconnection.
   * @param errorType The type of error that caused the disconnection.
   * @param message A descriptive message about the disconnection.
   * @returns {Promise<void>} A promise that resolves when the notification has been processed.
   */
  public async notifyPortDisconnected(
    tracker: PortConnectionTracker,
    slaveIds: number[],
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void> {
    tracker.notifyDisconnected(errorType, message, slaveIds);
    this._emitPortState(false, slaveIds, { type: errorType, message });
  }

  /**
   * Removes the state of a specific device (Slave ID) from the tracker of a given transport.
   * @param slaveId The Slave ID whose state should be removed.
   * @param transportId Optional transport ID to target a specific tracker. If omitted, the state will be removed from all trackers.
   * @returns {void}
   */
  public removeDeviceState(slaveId: number, transportId?: string): void {
    if (transportId) {
      const tracker = this._deviceTrackers.get(transportId);
      if (tracker) tracker.removeState(slaveId);
    } else {
      for (const tracker of this._deviceTrackers.values()) {
        tracker.removeState(slaveId);
      }
    }
  }

  /**
   * Clears the device tracker and associated handlers for a specific transport.
   * @param transportId The transport ID whose device tracker should be cleared.
   * @returns {Promise<void>} A promise that resolves when the tracker has been cleared.
   */
  public async clearTransport(transportId: string): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const deviceTracker = this._deviceTrackers.get(transportId);
      if (deviceTracker) {
        await deviceTracker.clear();
        this._deviceTrackers.delete(transportId);
      }

      this._deviceHandlers.delete(transportId);
    });
  }

  /**
   * Internal helper to propagate events to the global device handler.
   * @param slaveId The Slave ID for which to emit state.
   * @param connected Whether the device is connected (true) or disconnected (false).
   * @param error Optional error information if the device is disconnected.
   * @returns {void}
   * @private
   */
  private _emitDeviceState(
    slaveId: number,
    connected: boolean,
    error?: { type: EConnectionErrorType; message: string }
  ): void {
    if (this._globalDeviceHandler) {
      try {
        this._globalDeviceHandler(slaveId, connected, error);
      } catch (e) {
        console.error('Error in global device handler:', e);
      }
    }
  }

  /**
   * Internal helper to propagate events to the global port handler.
   * @param connected Whether the port is connected (true) or disconnected (false).
   * @param slaveIds The list of Slave IDs associated with the port.
   * @param error Optional error information if the port is disconnected.
   * @returns {void}
   * @private
   */
  private _emitPortState(
    connected: boolean,
    slaveIds: number[],
    error?: { type: EConnectionErrorType; message: string }
  ): void {
    if (this._globalPortHandler) {
      try {
        this._globalPortHandler(connected, slaveIds, error);
      } catch (e) {
        console.error('Error in global port handler:', e);
      }
    }
  }
}
