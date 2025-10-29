// src/transport/factory.d.ts

import type { Transport } from '../types/modbus-types.js';

declare module 'modbus-connect/transport-old' {
  export interface TransportOptions {
    port?: string | any; // 'any' для совместимости с Web Serial API (SerialPort)
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
  export function createTransport(
    type: 'node' | 'web',
    options?: TransportOptions
  ): Promise<Transport>;
}
