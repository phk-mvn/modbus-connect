// modbus/transport/controller/router/TransportRouter.ts

import type { TRSMode } from '../../../types/public.js';
import type { PortSession } from '../session/PortSession.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

/**
 * Interface for the Transport Router.
 */
export interface ITransportRouter {
  select(slaveId: number, requiredRSMode: TRSMode): PortSession | null;
}

/**
 * Handles the logic of selecting the most appropriate port session for a given request.
 * Prioritizes explicitly assigned sessions that are connected, then falls back to compatible ones.
 */
export class TransportRouter implements ITransportRouter {
  /**
   * @param {TransportRegistry} _registry - The registry to query for available sessions.
   */
  constructor(private readonly _registry: TransportRegistry) {}

  /**
   * Selects an optimal port session for the given Slave ID and Interface mode.
   *
   * Routing Logic:
   * 1. Finds sessions explicitly assigned to the Slave ID that are currently 'connected'.
   * 2. If no direct match is found, looks for a fallback session that is connected/connecting
   *    and matches the required RSMode (useful for buses like RS485).
   *
   * @param {number} slaveId - The target Modbus Slave/Unit ID.
   * @param {TRSMode} requiredRSMode - The required physical mode (RS485, RS232, or TCP/IP).
   * @returns {PortSession | null} The selected session (transport + queue) or null if none are available.
   */
  public select(slaveId: number, requiredRSMode: TRSMode): PortSession | null {
    const transportIds = this._registry.getSlaveAssignments(slaveId);
    const sessions = transportIds
      .map(id => this._registry.get(id))
      .filter((session): session is NonNullable<typeof session> => session !== undefined);

    for (const session of sessions) {
      if (session.status === 'connected' && session.rsMode === requiredRSMode) {
        return session;
      }
    }

    const allSessions = this._registry.getAll();
    const fallback = allSessions.find(
      session =>
        (session.status === 'connected' || session.status === 'connecting') &&
        session.rsMode === requiredRSMode &&
        (requiredRSMode === 'RS485' || requiredRSMode === 'TCP/IP' || session.slaveIds.length === 0)
    );

    return fallback ?? null;
  }
}
