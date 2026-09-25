// modbus/transport/factories/factories.ts

import { Logger, type ILogObj } from 'tslog';
import type {
  ITransport,
  TTransportType,
  INodeSerialTransportOptions,
  INodeTcpTransportOptions,
  IWebSerialTransportOptions,
  IWebSerialPort,
  IRtuEmulatorTransportOptions,
  ITcpEmulatorTransportOptions,
} from '../../types/public.js';

// ===================================================
// CONSTANTS
// ===================================================

/** Supported transport type identifiers. */
export const TRANSPORT_TYPES = {
  NODE_RTU: 'node-rtu',
  NODE_TCP: 'node-tcp',
  WEB_RTU: 'web-rtu',
  RTU_EMULATOR: 'rtu-emulator',
  TCP_EMULATOR: 'tcp-emulator',
} as const;

/** Valid configuration keys for Node.js Serial RTU transport. */
export const NODE_RTU_KEYS = [
  'baudRate',
  'dataBits',
  'stopBits',
  'parity',
  'readTimeout',
  'writeTimeout',
  'maxBufferSize',
  'reconnectInterval',
  'maxReconnectAttempts',
  'RSMode',
  'interFrameDelayMs',
  'exclusiveLock',
] as const;

/** Valid configuration keys for Node.js TCP transport. */
export const NODE_TCP_KEYS = [
  'readTimeout',
  'writeTimeout',
  'maxBufferSize',
  'reconnectInterval',
  'maxReconnectAttempts',
] as const;

/** Valid configuration keys for WebSerial RTU transport. */
export const WEB_RTU_KEYS = [
  'baudRate',
  'dataBits',
  'stopBits',
  'parity',
  'readTimeout',
  'writeTimeout',
  'reconnectInterval',
  'maxReconnectAttempts',
  'maxEmptyReadsBeforeReconnect',
  'RSMode',
] as const;

// ===================================================
// TYPES
// ===================================================

export type TransportOptionsMap = {
  [TRANSPORT_TYPES.NODE_RTU]: { port?: string; path?: string } & INodeSerialTransportOptions;
  [TRANSPORT_TYPES.NODE_TCP]: { host: string; port?: number } & INodeTcpTransportOptions;
  [TRANSPORT_TYPES.WEB_RTU]: { port: IWebSerialPort } & IWebSerialTransportOptions;
  [TRANSPORT_TYPES.RTU_EMULATOR]: IRtuEmulatorTransportOptions;
  [TRANSPORT_TYPES.TCP_EMULATOR]: ITcpEmulatorTransportOptions;
};

// ===================================================
// BASE
// ===================================================

/**
 * Abstract base class for transport-specific factories.
 * @template TOptions The type of configuration options this factory accepts.
 */
export abstract class TransportFactoryBase<TOptions = unknown> {
  /** The transport type identifier this factory handles. */
  abstract readonly type: TTransportType;

  /**
   * Creates an instance of a transport.
   *
   * @param options - Configuration options specific to the transport type.
   * @param logger - Logger instance for transport-level logging.
   * @returns A promise resolving to the created transport instance.
   */
  abstract create(options: TOptions, logger: Logger<ILogObj>): Promise<ITransport>;
}

/**
 * Filters an object to include only specified keys that have defined values.
 *
 * @template T Resulting object type.
 * @param source - The source object to filter.
 * @param keys - Keys to extract from the source object.
 * @returns A new object containing only the defined selected keys.
 */
export function pickDefinedKeys<T extends object>(source: object, keys: readonly string[]): T {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source && (source as Record<string, unknown>)[key] !== undefined) {
      result[key] = (source as Record<string, unknown>)[key];
    }
  }
  return result as T;
}

/**
 * Creates a factory function for WebSerial ports, ensuring the port is closed if already open.
 *
 * @param port - The WebSerial port instance.
 * @returns A factory function that returns a Promise resolving to the ready WebSerial port.
 */
export function createPortFactory(port: IWebSerialPort): () => Promise<IWebSerialPort> {
  return async () => {
    if (port.readable || port.writable) {
      await port.close();
    }
    return port;
  };
}

// ===================================================
// NODE RTU FACTORY
// ===================================================

/** Factory for creating Modbus RTU transports on Node.js using SerialPort. */
export class NodeRtuFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_RTU]
> {
  readonly type = TRANSPORT_TYPES.NODE_RTU;

  /**
   * Creates a Modbus RTU serial transport instance for Node.js.
   *
   * @param options - Configuration options for Node.js serial transport (port/path, baudRate, etc.).
   * @param _logger - Logger instance for diagnostics.
   * @returns A promise resolving to the created NodeSerialTransport instance.
   * @throws {Error} If neither "port" nor "path" is provided in options.
   */
  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_RTU],
    _logger: Logger<ILogObj>
  ): Promise<ITransport> {
    const path = options.port || options.path;
    if (!path) throw new Error('Missing "port" (or "path") for node-rtu transport');

    const { default: NodeSerialTransport } = await import('../node/serial.js');
    const transportOptions = pickDefinedKeys<INodeSerialTransportOptions>(options, NODE_RTU_KEYS);
    return new NodeSerialTransport(path, transportOptions);
  }
}

// ===================================================
// NODE TCP FACTORY
// ===================================================

/** Factory for creating Modbus TCP transports on Node.js. */
export class NodeTcpFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_TCP]
> {
  readonly type = TRANSPORT_TYPES.NODE_TCP;

  /**
   * Creates a Modbus TCP transport instance for Node.js.
   *
   * @param options - Configuration options for Node.js TCP transport (host, port, timeouts, etc.).
   * @param _logger - Logger instance for diagnostics.
   * @returns A promise resolving to the created NodeTcpTransport instance.
   * @throws {Error} If "host" is missing in options.
   */
  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_TCP],
    _logger: Logger<ILogObj>
  ): Promise<ITransport> {
    if (!options.host) throw new Error('Missing "host" for node-tcp transport');

    const { default: NodeTcpTransport } = await import('../node/tcp.js');
    const transportOptions = pickDefinedKeys<INodeTcpTransportOptions>(options, NODE_TCP_KEYS);
    return new NodeTcpTransport(options.host, options.port ?? 502, transportOptions);
  }
}

// ===================================================
// WEB RTU FACTORY
// ===================================================

/** Factory for creating Modbus RTU transports in the browser using WebSerial API. */
export class WebRtuFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.WEB_RTU]
> {
  readonly type = TRANSPORT_TYPES.WEB_RTU;

  /**
   * Creates a Modbus RTU WebSerial transport instance for browser environments.
   *
   * @param options - Configuration options for WebSerial transport including the port instance.
   * @param _logger - Logger instance for diagnostics.
   * @returns A promise resolving to the created WebSerialTransport instance.
   * @throws {Error} If "port" is missing in options.
   */
  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.WEB_RTU],
    _logger: Logger<ILogObj>
  ): Promise<ITransport> {
    if (!options.port) throw new Error('Missing "port" for web-rtu transport');

    const { default: WebSerialTransport } = await import('../web/serial.js');
    const portFactory = createPortFactory(options.port);
    const transportOptions = pickDefinedKeys<IWebSerialTransportOptions>(options, WEB_RTU_KEYS);
    return new WebSerialTransport(portFactory, transportOptions);
  }
}

// ===================================================
// RTU EMULATOR FACTORY
// ===================================================

/** Factory for creating RTU Emulators for testing and development. */
export class RtuEmulatorFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.RTU_EMULATOR]
> {
  readonly type = TRANSPORT_TYPES.RTU_EMULATOR;

  /**
   * Creates a simulated Modbus RTU emulator transport instance.
   *
   * @param options - Configuration options for the RTU emulator (slaveId, latency, registers, etc.).
   * @param _logger - Logger instance for diagnostics.
   * @returns A promise resolving to the created RtuEmulatorTransport instance.
   */
  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.RTU_EMULATOR],
    _logger: Logger<ILogObj>
  ): Promise<ITransport> {
    const { default: RtuEmulatorTransport } = await import('../emulator/rtu.js');
    return new RtuEmulatorTransport({
      slaveId: options.slaveId ?? 1,
      responseLatencyMs: options.responseLatencyMs ?? 5,
      loggerEnabled: options.loggerEnabled !== false,
      deviceIdentification: options.deviceIdentification,
      initialRegisters: options.initialRegisters,
    });
  }
}

// ===================================================
// TCP EMULATOR FACTORY
// ===================================================

/** Factory for creating TCP Emulators for testing and development. */
export class TcpEmulatorFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.TCP_EMULATOR]
> {
  readonly type = TRANSPORT_TYPES.TCP_EMULATOR;

  /**
   * Creates a simulated Modbus TCP emulator transport instance.
   *
   * @param options - Configuration options for the TCP emulator (slaveId, latency, registers, RSMode, etc.).
   * @param logger - Logger instance used for logging emulator creation.
   * @returns A promise resolving to the created TcpEmulatorTransport instance.
   */
  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.TCP_EMULATOR],
    logger: Logger<ILogObj>
  ): Promise<ITransport> {
    const { default: TcpEmulatorTransport } = await import('../emulator/tcp.js');
    logger.info({ slaveId: options.slaveId ?? 1 }, 'Creating TCP emulator transport');
    return new TcpEmulatorTransport({
      slaveId: options.slaveId ?? 1,
      responseLatencyMs: options.responseLatencyMs ?? 0,
      loggerEnabled: options.loggerEnabled !== false,
      deviceIdentification: options.deviceIdentification,
      initialRegisters: options.initialRegisters,
      RSMode: options.RSMode ?? 'TCP/IP',
    });
  }
}
