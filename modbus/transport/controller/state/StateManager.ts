// modbus/transport/controller/state/StateManager.ts

import { Mutex } from 'async-mutex';
import { DeviceConnectionTracker } from '../../trackers/device-tracker.js';
import { PortConnectionTracker } from '../../trackers/port-tracker.js';
import type {
  TDeviceStateHandler,
  TPortStateHandler,
  EConnectionErrorType,
} from '../../../types/public.js';

/**
 * Interface for the State Manager.
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
  setPortHandlerForTransport(transportId: string, handler: TPortStateHandler): Promise<void>;
  notifyPortConnected(transportId: string, slaveIds: number[]): Promise<void>;
  notifyPortDisconnected(
    transportId: string,
    slaveIds: number[],
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void>;

  createTrackersForTransport(transportId: string): void;
  clearTransport(transportId: string): Promise<void>;
  removeDeviceState(slaveId: number, transportId?: string): void;
}

/**
 * Manages connection states and event propagation for devices (Slave IDs) and ports (Transports).
 * It aggregates local transport trackers into global state handlers.
 */
export class StateManager implements IStateManager {
  private readonly _mutex = new Mutex();

  private _globalDeviceHandler: TDeviceStateHandler | null = null;
  private _globalPortHandler: TPortStateHandler | null = null;

  private readonly _deviceTrackers = new Map<string, DeviceConnectionTracker>();
  private readonly _portTrackers = new Map<string, PortConnectionTracker>();

  private readonly _deviceHandlers = new Map<string, TDeviceStateHandler>();
  private readonly _portHandlers = new Map<string, TPortStateHandler>();

  /**
   * Initializes internal trackers for a newly created transport.
   * @param {string} transportId - The transport identifier.
   */
  public createTrackersForTransport(transportId: string): void {
    const oldDeviceTracker = this._deviceTrackers.get(transportId);
    const oldPortTracker = this._portTrackers.get(transportId);
    if (oldDeviceTracker) oldDeviceTracker.clear().catch(() => {});
    if (oldPortTracker) oldPortTracker.clear().catch(() => {});

    this._deviceTrackers.set(transportId, new DeviceConnectionTracker());
    this._portTrackers.set(transportId, new PortConnectionTracker());
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
   * Sets a port handler for a specific transport.
   */
  public async setPortHandlerForTransport(
    transportId: string,
    handler: TPortStateHandler
  ): Promise<void> {
    const tracker = this._portTrackers.get(transportId);
    if (!tracker) {
      throw new Error(`No port tracker for transport "${transportId}"`);
    }
    await tracker.setHandler(handler);
    this._portHandlers.set(transportId, handler);
  }

  /**
   * Notifies that a port (transport) is successfully connected.
   */
  public async notifyPortConnected(transportId: string, slaveIds: number[]): Promise<void> {
    const tracker = this._portTrackers.get(transportId);
    if (tracker) {
      await tracker.notifyConnected(slaveIds);
    }

    this._emitPortState(true, slaveIds, undefined);
  }

  /**
   * Notifies that a port (transport) has been disconnected or failed.
   */
  public async notifyPortDisconnected(
    transportId: string,
    slaveIds: number[],
    errorType: EConnectionErrorType,
    message: string
  ): Promise<void> {
    const tracker = this._portTrackers.get(transportId);
    if (tracker) {
      tracker.notifyDisconnected(errorType, message, slaveIds);
    }

    this._emitPortState(false, slaveIds, { type: errorType, message });
  }

  /**
   * Cleans up stored state for a specific slave.
   * @param {number} slaveId - The slave ID to remove.
   * @param {string} [transportId] - Optional transport ID to limit the scope.
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
   * Completely removes a transport and all its associated trackers and handlers.
   * This is a thread-safe operation.
   * @param {string} transportId - The transport ID to clear.
   */
  public async clearTransport(transportId: string): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const deviceTracker = this._deviceTrackers.get(transportId);
      if (deviceTracker) {
        await deviceTracker.clear();
        this._deviceTrackers.delete(transportId);
      }

      const portTracker = this._portTrackers.get(transportId);
      if (portTracker) {
        await portTracker.clear();
        this._portTrackers.delete(transportId);
      }

      this._deviceHandlers.delete(transportId);
      this._portHandlers.delete(transportId);
    });
  }

  /**
   * Internal helper to propagate events to the global device handler.
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
