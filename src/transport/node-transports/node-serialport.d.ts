// src/transport/node-transports/node-serialport.d.ts

import { Transport, NodeSerialTransportOptions } from '../../types/modbus-types.js';

// Типы для состояния связи с устройством
interface DeviceConnectionStateObject {
  hasConnectionDevice: boolean;
  errorType?: string;
  errorMessage?: string;
}

type DeviceConnectionListener = (state: DeviceConnectionStateObject) => void;

declare class NodeSerialTransport implements Transport {
  constructor(port: string, options?: NodeSerialTransportOptions);

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(buffer: Uint8Array): Promise<void>;
  read(length: number, timeout?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  destroy(): void;

  // Методы для работы с слушателем состояния связи с устройством
  addDeviceConnectionListener(listener: DeviceConnectionListener): void;
  removeDeviceConnectionListener(listener: DeviceConnectionListener): void;
}

export {
  NodeSerialTransport,
  NodeSerialTransportOptions,
  DeviceConnectionStateObject,
  DeviceConnectionListener,
};
