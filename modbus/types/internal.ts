// modbus/types/internal.ts

// Внутренние типы - для использования внутри библиотеки

import {
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  TModbusProtocolType,
} from './public.js';

// ===================================================
// MODBUS PROTOCOL
// ===================================================

export interface IModbusProtocol {
  exchange(unitId: number, pduRequest: Uint8Array, timeout: number): Promise<Uint8Array>;
}

// ===================================================
// TRACKERS
// ===================================================

export interface IDeviceConnectionTracker {
  setHandler(handler: TDeviceStateHandler): Promise<void>;
  removeHandler(): Promise<void>;
  notifyConnected(slaveId: number): Promise<void>;
  notifyDisconnected(slaveId: number, errorType: EConnectionErrorType, errorMessage: string): void;
  removeState(slaveId: number): void;
  getState(slaveId: number): Promise<IDeviceConnectionStateObject | undefined>;
  getAllStates(): Promise<IDeviceConnectionStateObject[]>;
  clear(): Promise<void>;
  hasState(slaveId: number): Promise<boolean>;
  getConnectedSlaveIds(): Promise<number[]>;
  __resetDebounce(slaveId: number): void;
}

export interface IPortConnectionTracker {
  setHandler(handler: TPortStateHandler): Promise<void>;
  notifyConnected(slaveIds: number[]): Promise<void>;
  notifyDisconnected(
    errorType: EConnectionErrorType,
    errorMessage: string,
    slaveIds: number[]
  ): void;
  getState(): Promise<IPortConnectionState>;
  clear(): Promise<void>;
  isConnected(): Promise<boolean>;
  __resetDebounce(): void;
}

export interface IDeviceConnectionStateObject {
  slaveId: number;
  hasConnectionDevice: boolean;
  errorType?: EConnectionErrorType;
  errorMessage?: string;
}

export interface IDeviceConnectionTrackerOptions {
  debounceMs?: number;
  validateSlaveId?: boolean;
}

export interface IPortConnectionState {
  isConnected: boolean;
  errorType?: EConnectionErrorType;
  errorMessage?: string;
  slaveIds: number[];
  timestamp: number;
}

export interface IPortConnectionTrackerOptions {
  debounceMs?: number;
}

// ===================================================
// TRAFFIC SNIFFER
// ===================================================

export interface ITrafficSniffer {
  onPacket(handler: TSnifferHandler): () => void;
  onTransaction(handler: TTransactionHandler): () => void;
  recordTx(transportId: string, data: Uint8Array, protocol?: TModbusProtocolType): void;
  recordRxStart(): void;
  recordRxEnd(
    transportId: string,
    data: Uint8Array,
    protocol: TModbusProtocolType,
    error?: string
  ): void;
}

export interface ITransaction {
  id: string;
  transportId: string;
  protocol: TModbusProtocolType;
  request: ISnifferPacket;
  response: ISnifferPacket | null;
  status: 'ok' | 'error' | 'timeout';
  error?: string;
  durationMs: number;
  timestamp: number;
}

export type TTransactionHandler = (transaction: ITransaction) => void;

export interface ISnifferAnalysis {
  protocol: TModbusProtocolType;
  slaveId: number;
  funcCode: number;
  isException: boolean;
  crcValid: boolean;
  data?: any;
  description: string;
}

export interface ISnifferPacket {
  id: string;
  transportId: string;
  direction: 'tx' | 'rx';
  raw: Uint8Array;
  hex: string;
  ascii: string;
  timestamp: number;
  analysis?: ISnifferAnalysis;
  meta: {
    latencyMs?: number;
    transferMs?: number;
    totalMs?: number;
    bytesPerSecond?: number;
    error?: string;
    isFragment?: boolean;
  };
}

export type TSnifferHandler = (packet: ISnifferPacket) => void;
