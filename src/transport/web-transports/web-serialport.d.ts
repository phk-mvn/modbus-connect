// src/transport/web-transports/web-serialport.d.ts

import { Transport, WebSerialPort, WebSerialTransportOptions } from '../../types/modbus-types.js';

declare class WebSerialTransport implements Transport {
  constructor(portFactory: () => Promise<WebSerialPort>, options?: WebSerialTransportOptions);

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  destroy(): void;
}

export { WebSerialTransport, WebSerialTransportOptions, WebSerialPort };
