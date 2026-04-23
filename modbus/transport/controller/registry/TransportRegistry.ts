// modbus/transport/controller/registry/TransportRegistry.ts

import { Mutex } from 'async-mutex';
import type { ITransportInfo } from '../../../types/public.js';

/**
 * Interface for the Transport Registry.
 * Manages the storage and mapping of transports and their assigned Slave IDs.
 */
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

/**
 * Thread-safe registry for managing Modbus transports.
 * Maintains a primary map of transports and a secondary map for reverse-lookup of Slave IDs to Transports.
 */
export class TransportRegistry implements ITransportRegistry {
  private readonly _transports = new Map<string, ITransportInfo>();
  private readonly _slaveMap = new Map<number, string[]>();
  private readonly _mutex = new Mutex();

  /**
   * Checks if a transport with the given ID exists in the registry.
   * @param {string} id - The transport identifier.
   */
  public has(id: string): boolean {
    return this._transports.has(id);
  }

  /**
   * Retrieves transport information by its ID.
   * @param {string} id - The transport identifier.
   */
  public get(id: string): ITransportInfo | undefined {
    return this._transports.get(id);
  }

  /**
   * Returns an array of all registered transports.
   */
  public getAll(): ITransportInfo[] {
    return Array.from(this._transports.values());
  }

  /**
   * Adds a new transport to the registry.
   * This operation is thread-safe and will update slave mappings automatically.
   *
   * @param {ITransportInfo} info - The transport information object.
   * @throws {Error} If a transport with the same ID already exists.
   */
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

  /**
   * Removes a transport from the registry and cleans up slave mappings.
   * @param {string} id - The ID of the transport to remove.
   * @returns {Promise<ITransportInfo | undefined>} The removed transport info, or undefined if not found.
   */
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

  /**
   * Returns the number of registered transports.
   */
  public size(): number {
    return this._transports.size;
  }

  /**
   * Manually assigns a Slave ID to a specific transport.
   * @param {string} transportId - Target transport ID.
   * @param {number} slaveId - The Slave ID to assign.
   */
  public assignSlave(transportId: string, slaveId: number): void {
    const info = this._transports.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);

    if (!info.slaveIds.includes(slaveId)) {
      info.slaveIds.push(slaveId);
    }
    this._addToSlaveMap(slaveId, transportId);
  }

  /**
   * Removes a Slave ID assignment from a transport.
   * @param {string} transportId - Target transport ID.
   * @param {number} slaveId - The Slave ID to remove.
   */
  public unassignSlave(transportId: string, slaveId: number): void {
    const info = this._transports.get(transportId);
    if (!info) return;

    const idx = info.slaveIds.indexOf(slaveId);
    if (idx !== -1) {
      info.slaveIds.splice(idx, 1);
    }
    this._removeFromSlaveMap(slaveId, transportId);
  }

  /**
   * Returns a list of transport IDs assigned to a specific Slave ID.
   * @param {number} slaveId - The Slave ID to look up.
   */
  public getSlaveAssignments(slaveId: number): string[] {
    return this._slaveMap.get(slaveId) ?? [];
  }

  /**
   * Clears all Slave ID assignments for a specific transport in the reverse-lookup map.
   * @param {string} transportId - The transport ID to clear.
   */
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
