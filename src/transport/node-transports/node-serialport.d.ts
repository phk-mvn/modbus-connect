// src/transport/node-transports/node-serialport.d.ts
import { Transport, NodeSerialTransportOptions } from '../../types/modbus-types.js';

declare class NodeSerialTransport implements Transport {
  constructor(port: string, options?: NodeSerialTransportOptions);

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  destroy(): void;
}

export { NodeSerialTransport, NodeSerialTransportOptions };
