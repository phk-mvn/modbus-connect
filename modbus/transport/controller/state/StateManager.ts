// modbus/transport/controller/state/StateManager.ts

import { Mutex } from 'async-mutex';
import { DeviceConnectionTracker } from '../../trackers/device-tracker.js';
import { PortConnectionTracker } from '../../trackers/port-tracker.js';
import type {
  TDeviceStateHandler,
  TPortStateHandler,
  EConnectionErrorType,
} from '../../../types/public.js';

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
  removeDeviceState(slaveId: number): void;
}

export class StateManager implements IStateManager {
  private readonly _mutex = new Mutex();

  private _globalDeviceHandler: TDeviceStateHandler | null = null;
  private _globalPortHandler: TPortStateHandler | null = null;

  private readonly _deviceTrackers = new Map<string, DeviceConnectionTracker>();
  private readonly _portTrackers = new Map<string, PortConnectionTracker>();

  private readonly _deviceHandlers = new Map<string, TDeviceStateHandler>();
  private readonly _portHandlers = new Map<string, TPortStateHandler>();

  public createTrackersForTransport(transportId: string): void {
    this._deviceTrackers.set(transportId, new DeviceConnectionTracker());
    this._portTrackers.set(transportId, new PortConnectionTracker());
  }

  public setDeviceHandler(handler: TDeviceStateHandler): void {
    this._globalDeviceHandler = handler;
  }

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

  public async notifyDeviceConnected(transportId: string, slaveId: number): Promise<void> {
    const tracker = this._deviceTrackers.get(transportId);
    if (tracker) {
      await tracker.notifyConnected(slaveId);
    }

    this._emitDeviceState(slaveId, true, undefined);
  }

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

  public setPortHandler(handler: TPortStateHandler): void {
    this._globalPortHandler = handler;
  }

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

  public async notifyPortConnected(transportId: string, slaveIds: number[]): Promise<void> {
    const tracker = this._portTrackers.get(transportId);
    if (tracker) {
      await tracker.notifyConnected();
    }

    this._emitPortState(true, slaveIds, undefined);
  }

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

  public removeDeviceState(slaveId: number): void {
    for (const tracker of this._deviceTrackers.values()) {
      tracker.removeState(slaveId);
    }
  }

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
