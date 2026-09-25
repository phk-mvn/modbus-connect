// modbus/transport/controller/registry/ClientRegistry.ts

import type ModbusClient from '../../../core/client.js';
import type { IClientInfo } from '../../../types/public.js';
import { ClientAlreadyExistsError } from '../../../core/errors.js';

/** Registry entry: the client instance plus its public description. */
export interface IClientRegistryEntry {
  client: ModbusClient;
  info: IClientInfo;
}

/**
 * Registry of clients owned by the controller (clientId -> client).
 * The port session keeps the same clients in its own map; this registry is the
 * controller-level index used for lookups, listings and cleanup.
 */
export class ClientRegistry {
  private readonly _clients = new Map<string, IClientRegistryEntry>();
  private _sequence = 0;

  /** Generates the next internal client id. */
  public nextClientId(): string {
    return `client-${++this._sequence}`;
  }

  /**
   * Checks if a client with the given id exists in the registry.
   * @param clientId - The id of the client to check.
   * @returns True if the client exists, false otherwise.
   */
  public has(clientId: string): boolean {
    return this._clients.has(clientId);
  }

  /** Retrieves the client instance for the given id, if it exists.
   * @param clientId - The id of the client to retrieve.
   * @returns The ModbusClient instance if found, or undefined if not found.
   */
  public get(clientId: string): ModbusClient | undefined {
    return this._clients.get(clientId)?.client;
  }

  /** Retrieves the registry entry (client + info) for the given id, if it exists.
   * @param clientId - The id of the client to retrieve.
   * @returns The IClientRegistryEntry if found, or undefined if not found.
   */
  public getEntry(clientId: string): IClientRegistryEntry | undefined {
    return this._clients.get(clientId);
  }

  /** Adds a new client to the registry.
   * @param clientId - The id of the client to add.
   * @param client - The ModbusClient instance to add.
   * @param info - The public information about the client.
   * @throws ClientAlreadyExistsError if a client with the same id already exists.
   */
  public add(clientId: string, client: ModbusClient, info: IClientInfo): void {
    if (this._clients.has(clientId)) throw new ClientAlreadyExistsError(clientId);
    this._clients.set(clientId, { client, info });
  }

  /** Removes a client from the registry.
   * @param clientId - The id of the client to remove.
   * @returns True if the client was removed, false if it was not found.
   */
  public remove(clientId: string): boolean {
    return this._clients.delete(clientId);
  }

  /** Retrieves a list of all clients in the registry.
   * @returns An array of IClientInfo objects representing all clients.
   *
   */
  public getAll(): IClientInfo[] {
    return Array.from(this._clients.values()).map(entry => ({ ...entry.info }));
  }

  /**
   * Retrieves a list of all clients associated with a specific transport.
   * @param transportId - The id of the transport to filter clients by.
   * @returns An array of IClientRegistryEntry objects representing clients associated with the specified transport.
   */
  public getByTransport(transportId: string): IClientRegistryEntry[] {
    return Array.from(this._clients.values()).filter(
      entry => entry.info.transportId === transportId
    );
  }

  /** Counts the number of clients associated with a specific transport.
   * @param transportId - The id of the transport to count clients for.
   * @returns The number of clients associated with the specified transport.
   */
  public countByTransport(transportId: string): number {
    return this.getByTransport(transportId).length;
  }

  /** Returns the total number of clients in the registry.
   * @returns The total number of clients in the registry.
   */
  public size(): number {
    return this._clients.size;
  }

  /**
   * Clears all clients from the registry.
   * This method removes all clients and their associated information from the registry.
   * After calling this method, the registry will be empty.
   * Use with caution, as this will remove all client entries.
   */
  public clear(): void {
    this._clients.clear();
  }
}
