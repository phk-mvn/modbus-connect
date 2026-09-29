// modbus/transport/factory.ts

import { Logger, type ILogObj } from 'tslog';
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

export type TAnyTransportFactory =
  | TransportFactoryBase<TransportOptionsMap['node-rtu']>
  | TransportFactoryBase<TransportOptionsMap['node-tcp']>
  | TransportFactoryBase<TransportOptionsMap['web-rtu']>
  | TransportFactoryBase<TransportOptionsMap['rtu-emulator']>
  | TransportFactoryBase<TransportOptionsMap['tcp-emulator']>;

/**
 * Main factory class for Modbus transports.
 * Uses a static registry to manage and instantiate different transport types.
 */
export class TransportFactory {
  private static registry = new Map<TTransportType, TAnyTransportFactory>();

  static {
    this.register(new NodeRtuFactory());
    this.register(new NodeTcpFactory());
    this.register(new WebRtuFactory());
    this.register(new RtuEmulatorFactory());
    this.register(new TcpEmulatorFactory());
  }

  /**
   * Registers a new factory for a specific transport type.
   *
   * @param factory - The factory instance to register.
   * @returns void
   */
  static register(factory: TAnyTransportFactory): void {
    this.registry.set(factory.type, factory);
  }

  /**
   * Retrieves a registered factory for a specific transport type.
   *
   * @template T - The transport type identifier.
   * @param type - The transport type identifier.
   * @returns The factory instance corresponding to the transport type.
   * @throws {Error} If the transport type is not registered.
   */
  static getFactory<T extends TTransportType>(
    type: T
  ): TransportFactoryBase<TransportOptionsMap[T]> {
    const factory = this.registry.get(type);
    if (!factory) throw new Error(`Unknown transport type: ${type}`);
    return factory as TransportFactoryBase<TransportOptionsMap[T]>;
  }

  /**
   * Creates a transport instance based on the provided type and options.
   *
   * @template T - The transport type.
   * @param type - The type of transport to create.
   * @param options - Configuration options for the transport.
   * @param logger - Logger instance to pass to the transport.
   * @param sniffer - Optional sniffer for traffic monitoring.
   * @returns A promise resolving to the created transport instance.
   * @throws {Error} If factory creation fails or transport type is unregistered.
   */
  static async create<T extends TTransportType>(
    type: T,
    options: TransportOptionsMap[T],
    logger: Logger<ILogObj>,
    sniffer?: TrafficSniffer | null
  ): Promise<ITransport> {
    const log = logger.getSubLogger({ name: 'TransportFactory' });

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
   *
   * @returns Array of transport type keys.
   */
  static getRegisteredTypes(): TTransportType[] {
    return Array.from(this.registry.keys());
  }
}
