import { Logger } from 'pino';
import type { ITransport, TTransportType } from '../types/public.js';
import { TrafficSniffer } from './trackers/traffic-sniffer.js';
import {
  TransportFactoryBase,
  TransportOptionsMap,
  NodeRtuFactory,
  NodeTcpFactory,
  WebRtuFactory,
  RtuEmulatorFactory,
  TcpEmulatorFactory,
} from './factories/factories.js';

export class TransportFactory {
  private static registry = new Map<TTransportType, TransportFactoryBase<any>>();

  static {
    this.register(new NodeRtuFactory());
    this.register(new NodeTcpFactory());
    this.register(new WebRtuFactory());
    this.register(new RtuEmulatorFactory());
    this.register(new TcpEmulatorFactory());
  }

  static register(factory: TransportFactoryBase<any>): void {
    this.registry.set(factory.type, factory);
  }

  static getFactory<T extends TTransportType>(
    type: T
  ): TransportFactoryBase<TransportOptionsMap[T]> {
    const factory = this.registry.get(type);
    if (!factory) throw new Error(`Unknown transport type: ${type}`);
    return factory;
  }

  static async create<T extends TTransportType>(
    type: T,
    options: TransportOptionsMap[T],
    logger: Logger,
    sniffer?: TrafficSniffer | null
  ): Promise<ITransport> {
    const log = logger.child({ component: 'TransportFactory' });

    try {
      const factory = this.getFactory(type);
      const transport = await factory.create(options, log);
      if (sniffer) transport.setSniffer(sniffer);
      return transport;
    } catch (err) {
      log.error({ transportType: type, err }, 'Failed to create transport');
      throw err;
    }
  }

  static getRegisteredTypes(): TTransportType[] {
    return Array.from(this.registry.keys());
  }
}
