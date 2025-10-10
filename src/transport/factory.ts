// src/transport/factory.ts

import Logger from '../logger.js';
import type { Transport } from '../types/modbus-types.js';

const logger = new Logger();
logger.setTransportType('factory');

interface TransportOptions {
  port?: string | any; // 'any' потому что Web Serial API использует SerialPort
  path?: string;
  [key: string]: any;
}

/**
 * Creates a new transport instance for the given type and options.
 *
 * @param type - The type of transport to create. Supported types are:
 *   - `'node'`: For Node.js environment, uses serialport under the hood.
 *   - `'web'`: For web environment, uses Web Serial API under the hood.
 * @param options - Additional options for the transport.
 *   - For `'node'` transport, options are passed to the `SerialPort` constructor.
 *   - For `'web'` transport:
 *     - If `options.port` is provided, it's used to create the transport.
 * @returns The transport instance.
 * @throws {Error} If the type is unknown or unsupported, or if the options are invalid.
 */
export async function createTransport(
  type: 'node' | 'web',
  options: TransportOptions = {}
): Promise<Transport> {
  logger.setTransportType(type);

  try {
    switch (type) {
      case 'node': {
        const path = options.port || options.path;
        if (!path) {
          throw new Error('Missing "port" (or "path") option for node transport');
        }

        const { NodeSerialTransport } = await import('./node-transports/node-serialport.js');
        const rest = { ...options };
        delete rest.port;
        delete rest.path;

        return new NodeSerialTransport(path, rest);
      }

      case 'web': {
        const port = options.port;

        if (!port) {
          throw new Error('Missing "port" option for web transport');
        }

        const { WebSerialTransport } = await import('./web-transports/web-serialport.js');

        // Создаем фабрику, которая всегда возвращает тот же порт
        const portFactory = async (): Promise<any> => {
          logger.debug('WebSerialTransport portFactory: Returning provided port instance');

          // Пытаемся закрыть порт, если он открыт, чтобы сбросить состояние
          try {
            if (port.readable || port.writable) {
              logger.debug(
                'WebSerialTransport portFactory: Port seems to be in use, trying to close...'
              );
              try {
                await port.close();
                logger.debug('WebSerialTransport portFactory: Existing port closed');
              } catch (closeErr: any) {
                logger.warn(
                  'WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):',
                  closeErr.message
                );
                // Игнорируем ошибку закрытия
              }
            }
          } catch (err: any) {
            logger.error(
              'WebSerialTransport portFactory: Failed to prepare existing port for reuse:',
              err
            );
          }

          return port;
        };

        const rest = { ...options };
        delete rest.port; // Убираем port из опций транспорта

        logger.debug('Creating WebSerialTransport with provided port');
        return new WebSerialTransport(portFactory, rest);
      }

      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  } catch (err: any) {
    logger.error(`Failed to create transport of type "${type}": ${err.message}`);
    throw err;
  }
}
