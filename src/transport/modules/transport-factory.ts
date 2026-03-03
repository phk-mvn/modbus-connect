// src/transport/modules/transport-factory.ts

import type {
  Transport,
  NodeSerialTransportOptions,
  WebSerialTransportOptions,
  WebSerialPort,
  LoggerInstance,
} from '../../types/modbus-types.js';

/**
 * Фабрика для создания экземпляров транспорта.
 * Изолирует логику создания и настройки конкретных реализаций (Node/Web).
 */
export class TransportFactory {
  /**
   * Создает экземпляр транспорта в зависимости от типа.
   * @param type Тип транспорта ('node' | 'web' | 'node-tcp' | 'web-tcp')
   * @param options Опции транспорта
   * @param logger Инстанс логгера для передачи в Web-транспорт (если нужно) или для логирования ошибок создания
   */
  static async create(
    type: 'node' | 'web' | 'node-tcp' | 'web-tcp',
    options: any,
    logger: LoggerInstance
  ): Promise<Transport> {
    try {
      switch (type) {
        case 'node': {
          const path = options.port || options.path;
          if (!path) {
            throw new Error('Missing "port" (or "path") option for node transport');
          }

          // Динамический импорт для Node окружения
          // Используем import(), чтобы код не падал в браузере при сборке, если бандлер умный,
          // или просто для разделения чанков.
          const NodeSerialTransport = (await import('../node-transports/node-serialport.js'))
            .default;

          const nodeOptions: NodeSerialTransportOptions = {};
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

          // Создаем экземпляр
          return new NodeSerialTransport(path, nodeOptions);
        }

        case 'web': {
          const port = options.port as WebSerialPort;
          if (!port) {
            throw new Error('Missing "port" option for web transport');
          }

          // Динамический импорт для Web окружения
          const WebSerialTransport = (await import('../web-transports/web-serialport.js')).default;

          // Логика подготовки порта (фабрика порта для WebSerialTransport)
          const portFactory = async (): Promise<WebSerialPort> => {
            logger.debug('WebSerialTransport portFactory: Returning provided port instance');
            try {
              // Проверка, занят ли порт
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

          const webOptions: WebSerialTransportOptions = {};
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

          logger.debug('Creating WebSerialTransport with provided port');
          return new WebSerialTransport(portFactory, webOptions);
        }

        case 'node-tcp': {
          const { host, port } = options;
          if (!host || !port) {
            throw new Error('Missing "host" or "port" for node-tcp transport');
          }
          const NodeTcpTransport = (await import('../node-transports/node-tcp-transport.js'))
            .default;
          return new NodeTcpTransport(host, port, options);
        }

        case 'web-tcp': {
          const { url } = options;
          if (!url) {
            throw new Error('Missing "url" (WebSocket) for web-tcp transport');
          }
          const WebTcpTransport = (await import('../web-transports/web-tcp-transport.js')).default;
          return new WebTcpTransport(url, options);
        }

        default:
          throw new Error(`Unknown transport type: ${type}`);
      }
    } catch (err: any) {
      logger.error(`Failed to create transport of type "${type}": ${err.message}`);
      throw err;
    }
  }
}
