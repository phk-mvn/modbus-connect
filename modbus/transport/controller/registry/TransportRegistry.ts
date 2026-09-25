// modbus/transport/controller/registry/TransportRegistry.ts

import { Mutex } from 'async-mutex';
import type { PortSession } from '../session/PortSession.js';

/**
 * Interface for the Transport Registry.
 * Manages the storage and mapping of port sessions and their assigned Slave IDs.
 */
export interface ITransportRegistry {
  has(id: string): boolean;
  get(id: string): PortSession | undefined;
  getAll(): PortSession[];
  add(session: PortSession): void;
  remove(id: string): Promise<PortSession | undefined>;
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
  private readonly _transports = new Map<string, PortSession>();
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
  public get(id: string): PortSession | undefined {
    return this._transports.get(id);
  }

  /**
   * Retrieves all registered transports.
   * @returns {PortSession[]} An array of all registered PortSession instances.
   */
  public getAll(): PortSession[] {
    return Array.from(this._transports.values());
  }

  /**
   * Adds a new transport to the registry.
   * This operation is thread-safe and will update slave mappings automatically.
   *
   * @param {PortSession} session - The port session to register.
   * @throws {Error} If a transport with the same ID already exists.
   */
  public async add(session: PortSession): Promise<void> {
    await this._mutex.runExclusive(() => {
      if (this._transports.has(session.id)) {
        throw new Error(`Transport "${session.id}" already exists`);
      }
      this._transports.set(session.id, session);

      for (const slaveId of session.slaveIds) {
        this._addToSlaveMap(slaveId, session.id);
      }
    });
  }

  /**
   * Removes a transport from the registry and cleans up slave mappings.
   * @param {string} id - The ID of the transport to remove.
   * @returns {Promise<PortSession | undefined>} The removed session, or undefined if not found.
   */
  public async remove(id: string): Promise<PortSession | undefined> {
    return await this._mutex.runExclusive(() => {
      const session = this._transports.get(id);
      if (!session) return undefined;

      for (const slaveId of session.slaveIds) {
        this._removeFromSlaveMap(slaveId, id);
      }

      this._transports.delete(id);
      return session;
    });
  }

  /**
   * Returns the number of registered transports.
   * @returns {number} The number of registered transports.
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
    const session = this._transports.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);

    if (!session.slaveIds.includes(slaveId)) {
      session.slaveIds.push(slaveId);
    }
    this._addToSlaveMap(slaveId, transportId);
  }

  /**
   * Removes a Slave ID assignment from a transport.
   * @param {string} transportId - Target transport ID.
   * @param {number} slaveId - The Slave ID to remove.
   */
  public unassignSlave(transportId: string, slaveId: number): void {
    const session = this._transports.get(transportId);
    if (!session) return;

    const idx = session.slaveIds.indexOf(slaveId);
    if (idx !== -1) {
      session.slaveIds.splice(idx, 1);
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

  /**
   * Removes all transports and clears all slave mappings.
   * Used during controller shutdown to fully release resources.
   * @returns {void}
   */
  public clearAll(): void {
    this._transports.clear();
    this._slaveMap.clear();
  }

  /** Adds a transport ID to the list of transports associated with a Slave ID.
   * @param {number} slaveId - The Slave ID to associate with the transport.
   * @param {string} transportId - The transport ID to add.
   */
  private _addToSlaveMap(slaveId: number, transportId: string): void {
    const list = this._slaveMap.get(slaveId) ?? [];
    if (!list.includes(transportId)) {
      list.push(transportId);
      this._slaveMap.set(slaveId, list);
    }
  }

  /** Removes a transport ID from the list of transports associated with a Slave ID.
   * If the list becomes empty, the Slave ID entry is removed from the map.
   * @param {number} slaveId - The Slave ID to disassociate from the transport.
   * @param {string} transportId - The transport ID to remove.
   */
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
