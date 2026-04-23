// modbus/transport/factory.ts

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

/**
 * Main factory class for Modbus transports.
 * Uses a static registry to manage and instantiate different transport types.
 */
export class TransportFactory {
  private static registry = new Map<TTransportType, TransportFactoryBase<any>>();

  static {
    this.register(new NodeRtuFactory());
    this.register(new NodeTcpFactory());
    this.register(new WebRtuFactory());
    this.register(new RtuEmulatorFactory());
    this.register(new TcpEmulatorFactory());
  }

  /**
   * Registers a new factory for a specific transport type.
   * @param {TransportFactoryBase<any>} factory - The factory to register.
   */
  static register(factory: TransportFactoryBase<any>): void {
    this.registry.set(factory.type, factory);
  }

  /**
   * Retrieves a registered factory for a specific transport type.
   * @template T The transport type.
   * @param {T} type - The transport type identifier.
   * @returns {TransportFactoryBase<TransportOptionsMap[T]>} The factory instance.
   * @throws {Error} If the transport type is not registered.
   */
  static getFactory<T extends TTransportType>(
    type: T
  ): TransportFactoryBase<TransportOptionsMap[T]> {
    const factory = this.registry.get(type);
    if (!factory) throw new Error(`Unknown transport type: ${type}`);
    return factory;
  }

  /**
   * Creates a transport instance based on the provided type and options.
   *
   * @template T The transport type.
   * @param {T} type - The type of transport to create.
   * @param {TransportOptionsMap[T]} options - Configuration options for the transport.
   * @param {Logger} logger - Logger instance to pass to the transport.
   * @param {TrafficSniffer | null} [sniffer] - Optional sniffer for traffic monitoring.
   * @returns {Promise<ITransport>} A promise resolving to the created transport.
   */
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

  /**
   * Returns a list of all registered transport types.
   * @returns {TTransportType[]} Array of transport type keys.
   */
  static getRegisteredTypes(): TTransportType[] {
    return Array.from(this.registry.keys());
  }
}
