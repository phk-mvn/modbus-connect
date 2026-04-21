// modbus/transport/factories/factories.ts

import { Logger } from 'pino';
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

export const TRANSPORT_TYPES = {
  NODE_RTU: 'node-rtu',
  NODE_TCP: 'node-tcp',
  WEB_RTU: 'web-rtu',
  RTU_EMULATOR: 'rtu-emulator',
  TCP_EMULATOR: 'tcp-emulator',
} as const;

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
] as const;

export const NODE_TCP_KEYS = [
  'readTimeout',
  'writeTimeout',
  'maxBufferSize',
  'reconnectInterval',
  'maxReconnectAttempts',
] as const;

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

export abstract class TransportFactoryBase<TOptions = unknown> {
  abstract readonly type: TTransportType;
  abstract create(options: TOptions, logger: Logger): Promise<ITransport>;
}

export function pickDefinedKeys<T extends object>(source: object, keys: readonly string[]): T {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source && (source as Record<string, unknown>)[key] !== undefined) {
      result[key] = (source as Record<string, unknown>)[key];
    }
  }
  return result as T;
}

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

export class NodeRtuFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_RTU]
> {
  readonly type = TRANSPORT_TYPES.NODE_RTU;

  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_RTU],
    _logger: Logger
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

export class NodeTcpFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_TCP]
> {
  readonly type = TRANSPORT_TYPES.NODE_TCP;

  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.NODE_TCP],
    _logger: Logger
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

export class WebRtuFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.WEB_RTU]
> {
  readonly type = TRANSPORT_TYPES.WEB_RTU;

  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.WEB_RTU],
    _logger: Logger
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

export class RtuEmulatorFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.RTU_EMULATOR]
> {
  readonly type = TRANSPORT_TYPES.RTU_EMULATOR;

  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.RTU_EMULATOR],
    _logger: Logger
  ): Promise<ITransport> {
    const { default: RtuEmulatorTransport } = await import('../emulator/rtu.js');
    return new RtuEmulatorTransport({
      slaveId: options.slaveId ?? 1,
      responseLatencyMs: options.responseLatencyMs ?? 5,
      loggerEnabled: options.loggerEnabled !== false,
      initialRegisters: options.initialRegisters,
    });
  }
}

// ===================================================
// TCP EMULATOR FACTORY
// ===================================================

export class TcpEmulatorFactory extends TransportFactoryBase<
  TransportOptionsMap[typeof TRANSPORT_TYPES.TCP_EMULATOR]
> {
  readonly type = TRANSPORT_TYPES.TCP_EMULATOR;

  async create(
    options: TransportOptionsMap[typeof TRANSPORT_TYPES.TCP_EMULATOR],
    logger: Logger
  ): Promise<ITransport> {
    const { default: TcpEmulatorTransport } = await import('../emulator/tcp.js');
    logger.info({ slaveId: options.slaveId ?? 1 }, 'Creating TCP emulator transport');
    return new TcpEmulatorTransport({
      slaveId: options.slaveId ?? 1,
      responseLatencyMs: options.responseLatencyMs ?? 0,
      loggerEnabled: options.loggerEnabled !== false,
      initialRegisters: options.initialRegisters,
      RSMode: options.RSMode ?? 'TCP/IP',
    });
  }
}
