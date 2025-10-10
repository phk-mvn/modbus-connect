// slave-emulator/slave-emulator.d.ts

import {
  LoggerInstance,
  InfinityChangeParams,
  StopInfinityChangeParams,
  SlaveEmulatorOptions,
  RegisterDefinitions,
} from '../types/modbus-types.js';

declare class SlaveEmulator {
  private slaveAddress: number;
  private coils: Map<number, boolean>;
  private discreteInputs: Map<number, boolean>;
  private holdingRegisters: Map<number, number>;
  private inputRegisters: Map<number, number>;
  private exceptions: Map<string, number>;
  private _infinityTasks: Map<string, NodeJS.Timeout>;
  private loggerEnabled: boolean;
  private logger: LoggerInstance;
  public connected: boolean;

  constructor(slaveAddress?: number, options?: SlaveEmulatorOptions);

  // Методы для управления логгером
  enableLogger(): void;
  disableLogger(): void;

  // Подключение/отключение
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Методы для бесконечных изменений
  infinityChange(params: InfinityChangeParams): void;
  stopInfinityChange(params: StopInfinityChangeParams): void;

  // Методы для исключений
  setException(functionCode: number, address: number, exceptionCode: number): void;

  // Методы для добавления/управления регистрами
  addRegisters(definitions: RegisterDefinitions): void;
  setCoil(address: number, value: boolean): void;
  getCoil(address: number): boolean;
  readCoils(startAddress: number, quantity: number): boolean[];
  writeSingleCoil(address: number, value: boolean): void;
  writeMultipleCoils(startAddress: number, values: boolean[]): void;
  setDiscreteInput(address: number, value: boolean): void;
  getDiscreteInput(address: number): boolean;
  readDiscreteInputs(startAddress: number, quantity: number): boolean[];
  writeSingleRegister(address: number, value: number): void;
  writeMultipleRegisters(startAddress: number, values: number[]): void;
  setHoldingRegister(address: number, value: number): void;
  getHoldingRegister(address: number): number;
  readHoldingRegisters(startAddress: number, quantity: number): number[];
  setInputRegister(address: number, value: number): void;
  getInputRegister(address: number): number;
  readInputRegisters(startAddress: number, quantity: number): number[];

  // Прямые методы (без RTU)
  readHolding(start: number, quantity: number): number[];
  readInput(start: number, quantity: number): number[];

  // Методы диагностики и мониторинга
  getRegisterStats(): {
    coils: number;
    discreteInputs: number;
    holdingRegisters: number;
    inputRegisters: number;
    exceptions: number;
    infinityTasks: number;
  };
  getRegisterDump(): {
    coils: { [key: number]: boolean };
    discreteInputs: { [key: number]: boolean };
    holdingRegisters: { [key: number]: number };
    inputRegisters: { [key: number]: number };
  };
  getInfinityTasks(): string[];
  clearAllRegisters(): void;
  clearExceptions(): void;
  clearInfinityTasks(): void;

  // Graceful shutdown
  destroy(): Promise<void>;

  // Modbus RTU Frame handler
  handleRequest(buffer: Uint8Array): Uint8Array | null;
}

export = SlaveEmulator;
