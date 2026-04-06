// modbus/transport/modules/transport-factory.ts

import { Logger } from 'pino';

import type {
  ITransport,
  INodeSerialTransportOptions,
  INodeTcpTransportOptions,
  IWebSerialPort,
  IWebSerialTransportOptions,
} from '../../types/modbus-types';

/**
 * TransportFactory is a static factory class responsible for creating
 * different types of transport implementations (serial, TCP, WebSerial, etc.).
 * It encapsulates the logic for dynamic imports and configuration mapping.
 */
export class TransportFactory {
  /**
   * Creates and returns a transport instance based on the specified type.
   * @param type - Type of transport to create ('node', 'web', 'node-tcp', 'web-tcp')
   * @param options - Configuration options specific to the chosen transport
   * @param logger - Winston logger instance for error reporting
   * @returns Promise that resolves to an ITransport implementation
   * @throws Error if required options are missing or transport type is unknown
   */
  static async create(
    type: 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator',
    options: any,
    logger: Logger
  ): Promise<ITransport> {
    const factoryLogger = logger.child({ component: 'TransportFactory' });

    try {
      switch (type) {
        case 'node-rtu': {
          const path = options.port || options.path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }

          const NodeSerialTransport = (await import('../node-transports/node-rtu.js')).default;

          const nodeOptions: INodeSerialTransportOptions = {};
          const allowedNodeKeys = [
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
          ];

          for (const key of allowedNodeKeys) {
            if (key in options) {
              (nodeOptions as any)[key] = options[key];
            }
          }

          return new NodeSerialTransport(path, nodeOptions);
        }

        case 'node-tcp': {
          const host = options.host;
          const port = options.port || 502;

          if (!host) {
            throw new Error('Missing "host" option for node-tcp transport');
          }

          const NodeTcpTransport = (await import('../node-transports/node-tcp.js')).default;

          const tcpOptions: INodeTcpTransportOptions = {};

          const allowedTcpKeys = [
            'readTimeout',
            'writeTimeout',
            'maxBufferSize',
            'reconnectInterval',
            'maxReconnectAttempts',
          ];

          for (const key of allowedTcpKeys) {
            if (key in options) {
              (tcpOptions as any)[key] = options[key];
            }
          }

          return new NodeTcpTransport(host, port, tcpOptions);
        }

        case 'web-rtu': {
          const port = options.port as IWebSerialPort;
          if (!port) throw new Error('Missing "port" options for web transport');

          const WebSerialTransport = (await import('../web-transports/web-rtu.js')).default;

          const portFactory = async (): Promise<IWebSerialPort> => {
            if (port.readable || port.writable) {
              await port.close();
            }

            return port;
          };

          const webOptions: IWebSerialTransportOptions = {};
          const allowedWebKeys = [
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
          ];

          for (const key of allowedWebKeys) {
            if (key in options) {
              (webOptions as any)[key] = options[key];
            }
          }

          return new WebSerialTransport(portFactory, webOptions);
        }

        case 'rtu-emulator': {
          const RtuEmulatorTransport = (await import('../emulator-transports/rtu-emulator.js'))
            .default;

          const opts = {
            slaveId: options.slaveId || 1,
            responseLatencyMs: options.responseLatencyMs || 5,
            loggerEnabled: options.loggerEnabled !== false,
            initialRegisters: options.initialRegisters,
          };

          return new RtuEmulatorTransport(opts);
        }

        case 'tcp-emulator': {
          const TcpEmulatorTransport = (await import('../emulator-transports/tcp-emulator.js'))
            .default;

          const emulatorOptions = {
            slaveId: options.slaveId || 1,
            responseLatencyMs: options.responseLatencyMs || 0,
            loggerEnabled: options.loggerEnabled !== false,
            initialRegisters: options.initialRegisters,
            RSMode: options.RSMode || 'TCP/IP',
          };

          factoryLogger.info(`Creating emulator transport for slaveId ${emulatorOptions.slaveId}`);
          return new TcpEmulatorTransport(emulatorOptions);
        }

        default:
          throw new Error(`Unknown transport type ${type}`);
      }
    } catch (err: any) {
      factoryLogger.error(
        { transportType: type, error: err.message },
        'Failed to create transport'
      );
      throw err;
    }
  }
}
