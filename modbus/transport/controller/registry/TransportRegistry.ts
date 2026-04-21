// modbus/transport/controller/registry/TransportRegistry.ts

import { Mutex } from 'async-mutex';
import type { ITransportInfo } from '../../../types/public.js';

export interface ITransportRegistry {
  has(id: string): boolean;
  get(id: string): ITransportInfo | undefined;
  getAll(): ITransportInfo[];
  add(info: ITransportInfo): void;
  remove(id: string): Promise<ITransportInfo | undefined>;
  size(): number;
  assignSlave(transportId: string, slaveId: number): void;
  unassignSlave(transportId: string, slaveId: number): void;
  getSlaveAssignments(slaveId: number): string[];
  clearSlaveAssignments(transportId: string): void;
}

export class TransportRegistry implements ITransportRegistry {
  private readonly _transports = new Map<string, ITransportInfo>();
  private readonly _slaveMap = new Map<number, string[]>();
  private readonly _mutex = new Mutex();

  public has(id: string): boolean {
    return this._transports.has(id);
  }

  public get(id: string): ITransportInfo | undefined {
    return this._transports.get(id);
  }

  public getAll(): ITransportInfo[] {
    return Array.from(this._transports.values());
  }

  public async add(info: ITransportInfo): Promise<void> {
    await this._mutex.runExclusive(() => {
      if (this._transports.has(info.id)) {
        throw new Error(`Transport "${info.id}" already exists`);
      }
      this._transports.set(info.id, info);

      for (const slaveId of info.slaveIds) {
        this._addToSlaveMap(slaveId, info.id);
      }
    });
  }

  public async remove(id: string): Promise<ITransportInfo | undefined> {
    return await this._mutex.runExclusive(() => {
      const info = this._transports.get(id);
      if (!info) return undefined;

      for (const slaveId of info.slaveIds) {
        this._removeFromSlaveMap(slaveId, id);
      }

      this._transports.delete(id);
      return info;
    });
  }

  public size(): number {
    return this._transports.size;
  }

  public assignSlave(transportId: string, slaveId: number): void {
    const info = this._transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);

    if (!info.slaveIds.includes(slaveId)) {
      info.slaveIds.push(slaveId);
    }
    this._addToSlaveMap(slaveId, transportId);
  }

  public unassignSlave(transportId: string, slaveId: number): void {
    const info = this._transports.get(transportId);
    if (!info) return;

    const idx = info.slaveIds.indexOf(slaveId);
    if (idx !== -1) {
      info.slaveIds.splice(idx, 1);
    }
    this._removeFromSlaveMap(slaveId, transportId);
  }

  public getSlaveAssignments(slaveId: number): string[] {
    return this._slaveMap.get(slaveId) ?? [];
  }

  public clearSlaveAssignments(transportId: string): void {
    for (const [slaveId, transportIds] of this._slaveMap.entries()) {
      const filtered = transportIds.filter(id => id !== transportId);
      if (filtered.length === 0) {
        this._slaveMap.delete(slaveId);
      } else {
        this._slaveMap.set(slaveId, filtered);
      }
    }
  }

  private _addToSlaveMap(slaveId: number, transportId: string): void {
    const list = this._slaveMap.get(slaveId) ?? [];
    if (!list.includes(transportId)) {
      list.push(transportId);
      this._slaveMap.set(slaveId, list);
    }
  }

  private _removeFromSlaveMap(slaveId: number, transportId: string): void {
    const list = this._slaveMap.get(slaveId);
    if (!list) return;

    const filtered = list.filter(id => id !== transportId);
    if (filtered.length === 0) {
      this._slaveMap.delete(slaveId);
    } else {
      this._slaveMap.set(slaveId, filtered);
    }
  }
}
