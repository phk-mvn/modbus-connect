// modbus/transport/controller/router/TransportRouter.ts

import type { ITransport, TRSMode } from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

export interface ITransportRouter {
  select(slaveId: number, requiredRSMode: TRSMode): ITransport | null;
}

export class TransportRouter implements ITransportRouter {
  constructor(private readonly _registry: TransportRegistry) {}

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
