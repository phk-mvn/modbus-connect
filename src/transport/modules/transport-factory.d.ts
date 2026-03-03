// src/transport/modules/transport-factory.d.ts

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
export declare class TransportFactory {
  /**
   * Создает экземпляр транспорта для Node.js.
   * Требуется указать 'port' или 'path' внутри options.
   */
  static create(
    type: 'node',
    options: NodeSerialTransportOptions & { port?: string; path?: string },
    logger: LoggerInstance
  ): Promise<Transport>;

  /**
   * Создает экземпляр транспорта для Web (браузера).
   * Требуется передать объект WebSerialPort в поле 'port'.
   */
  static create(
    type: 'web',
    options: WebSerialTransportOptions & { port: WebSerialPort },
    logger: LoggerInstance
  ): Promise<Transport>;

  /**
   * Общая сигнатура метода
   */
  static create(
    type: 'node' | 'web' | 'node-tcp' | 'web-tcp',
    options: any,
    logger: LoggerInstance
  ): Promise<Transport>;
}
