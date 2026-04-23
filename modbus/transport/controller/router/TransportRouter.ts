// modbus/transport/controller/router/TransportRouter.ts

import type { ITransport, TRSMode } from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

/**
 * Interface for the Transport Router.
 */
export interface ITransportRouter {
  select(slaveId: number, requiredRSMode: TRSMode): ITransport | null;
}

/**
 * Handles the logic of selecting the most appropriate transport for a given request.
 * Prioritizes explicitly assigned transports that are connected, then falls back to compatible transports.
 */
export class TransportRouter implements ITransportRouter {
  /**
   * @param {TransportRegistry} _registry - The registry to query for available transports.
   */
  constructor(private readonly _registry: TransportRegistry) {}

  /**
   * Selects an optimal transport for the given Slave ID and Interface mode.
   *
   * Routing Logic:
   * 1. Finds transports explicitly assigned to the Slave ID that are currently 'connected'.
   * 2. If no direct match is found, looks for a fallback transport that is connected/connecting
   *    and matches the required RSMode (useful for buses like RS485).
   *
   * @param {number} slaveId - The target Modbus Slave/Unit ID.
   * @param {TRSMode} requiredRSMode - The required physical mode (RS485, RS232, or TCP/IP).
   * @returns {ITransport | null} The selected transport instance or null if none are available.
   */
  public select(slaveId: number, requiredRSMode: TRSMode): ITransport | null {
    const transportIds = this._registry.getSlaveAssignments(slaveId);
    const transports = transportIds
      .map(id => this._registry.get(id))
      .filter((info): info is NonNullable<typeof info> => info !== undefined);

    for (const info of transports) {
      if (info.status === 'connected' && info.rsMode === requiredRSMode) {
        return info.transport;
      }
    }

    const allTransports = this._registry.getAll();
    const fallback = allTransports.find(
      info =>
        (info.status === 'connected' || info.status === 'connecting') &&
        info.rsMode === requiredRSMode &&
        (requiredRSMode === 'RS485' || requiredRSMode === 'TCP/IP' || info.slaveIds.length === 0)
    );

    return fallback?.transport ?? null;
  }
}
