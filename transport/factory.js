// transport/factory.js
// @ts-nocheck
const logger = require('../logger.js');

/**
 * Creates a new transport instance for the given type and options.
 *
 * @param {string} type - The type of transport to create. Supported types are:
 *   - `'node'`: For Node.js environment, uses serialport under the hood.
 *   - `'node-tcp'`: For Node.js environment, uses net under the hood.
 *   - `'web'`: For web environment, uses Web Serial API under the hood.
 *   - `'web-tcp'`: For web environment, uses Web Sockets under the hood.
 * @param {object} [options] - Additional options for the transport.
 *   - For `'node'` transport, options are passed to the `SerialPort` constructor.
 *   - For `'node-tcp'` transport, options are passed to the `net.Socket` constructor.
 *   - For `'web'` transport:
 *     - If `options.portFactory` is provided, it's used to create the transport (RECOMMENDED for robust reconnects).
 *     - Otherwise, `options.port` is used (legacy way, less robust for reconnects).
 *   - For `'web-tcp'` transport, options are passed to the `WebTcpSerialTransport` constructor.
 * @returns {Promise<Transport>} The transport instance.
 * @throws {Error} If the type is unknown or unsupported, or if the options are invalid.
 */
async function createTransport(type, options = {}) {
  logger.setTransportType(type);

  try {
    switch (type) {
      // Creating a Transport for the Node.js Environment
      case 'node': {
        const path = options.port || options.path;
        if (!path) {
          throw new Error('Missing "port" (or "path") option for node transport');
        }
        const { NodeSerialTransport } = require('./node-transports/node-serialport.js');
        const rest = { ...options };
        delete rest.port;
        delete rest.path;
        return new NodeSerialTransport(path, rest);
      }

      // Creating a Transport for the Web Environment
      case 'web': {
        const port = options.port;
        
        if (!port) {
          throw new Error('Missing "port" option for web transport');
        }

        const { WebSerialTransport } = require('./web-transports/web-serialport.js');

        // Создаем фабрику, которая всегда возвращает тот же порт
        const portFactory = async () => {
          logger.debug('WebSerialTransport portFactory: Returning provided port instance');
          
          // Пытаемся закрыть порт, если он открыт, чтобы сбросить состояние
          try {
            if (port.readable || port.writable) {
              logger.debug('WebSerialTransport portFactory: Port seems to be in use, trying to close...');
              try {
                await port.close();
                logger.debug('WebSerialTransport portFactory: Existing port closed');
              } catch (closeErr) {
                logger.warn('WebSerialTransport portFactory: Error closing existing port (might be already closed or broken):', closeErr.message);
                // Игнорируем ошибку закрытия
              }
            }
          } catch (err) {
            logger.error('WebSerialTransport portFactory: Failed to prepare existing port for reuse:', err);
          }
          
          return port;
        };

        const rest = { ...options };
        delete rest.port; // Убираем port из опций транспорта
        
        logger.debug('Creating WebSerialTransport with provided port');
        return new WebSerialTransport(portFactory, rest);
      }

      // Unknown or unsupported type
      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  } catch (err) {
    logger.error(`Failed to create transport of type "${type}": ${err.message}`);
    throw err;
  }
}

module.exports = { createTransport }