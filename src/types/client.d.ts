// src/types/client.d.ts

import { IModbusPlugin } from './modbus-types.js';
import { RegisterType } from '../constants/constants.js';
import { LogContext as LoggerContext } from './logger.js';
import {
  ModbusClientOptions,
  ReadCoilsResponse,
  ReadDiscreteInputsResponse,
  WriteSingleCoilResponse,
  WriteMultipleCoilsResponse,
  WriteSingleRegisterResponse,
  WriteMultipleRegistersResponse,
  ReportSlaveIdResponse,
  ReadDeviceIdentificationResponse,
  TransportControllerInterface,
} from './modbus-types.js';

declare class ModbusClient {
  /**
   * Creates a new Modbus client instance.
   * @param transportController - The TransportControllerInterface managing transports.
   * @param slaveId - The slave ID (1–255, default: 1).
   * @param options - Configuration options for the client, including plugins.
   */
  constructor(
    transportController: TransportControllerInterface,
    slaveId?: number,
    options?: ModbusClientOptions
  );

  /**
   * Enables the ModbusClient logger.
   * @param level - Logging level (default: 'info').
   */
  enableLogger(level?: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void;

  /**
   * Disables the ModbusClient logger (sets level to 'error').
   */
  disableLogger(): void;

  /**
   * Sets a global context for the logger.
   * @param context - Context for the logger.
   */
  setLoggerContext(context: LoggerContext): void;

  /**
   * Registers a plugin to extend the client's functionality.
   * @param plugin - An instance of a plugin that implements the IModbusPlugin interface.
   */
  use(plugin: IModbusPlugin): void;

  /**
   * Executes a custom Modbus function registered via a plugin.
   * @param functionName - The name of the function as defined in the plugin.
   * @param args - Arguments that will be passed to the plugin's `buildRequest` handler.
   * @returns A promise that resolves to the value returned by the plugin's `parseResponse` handler.
   */
  executeCustomFunction(functionName: string, ...args: any[]): Promise<any>;

  /**
   * Performs a logical connection check to ensure the client is ready for communication.
   */
  connect(): Promise<void>;

  /**
   * Performs a logical disconnection for the client.
   */
  disconnect(): Promise<void>;

  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125).
   * @param options - Options for the read operation, including a built-in or custom register conversion type.
   * @returns A promise that resolves to the converted registers.
   */
  readHoldingRegisters<T extends RegisterType | string>(
    startAddress: number,
    quantity: number,
    options?: { type?: T }
  ): Promise<any>;

  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125).
   * @param options - Options for the read operation, including a built-in or custom register conversion type.
   * @returns A promise that resolves to the converted registers.
   */
  readInputRegisters<T extends RegisterType | string>(
    startAddress: number,
    quantity: number,
    options?: { type?: T }
  ): Promise<any>;

  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write (0–65535).
   * @param value - The value to write to the register (0–65535).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the write operation response.
   */
  writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<WriteSingleRegisterResponse>;

  /**
   * Writes multiple registers to the Modbus device.
   * @param startAddress - The starting address of the registers to write (0–65535).
   * @param values - An array of values to write (each 0–65535).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the write operation response.
   */
  writeMultipleRegisters(
    startAddress: number,
    values: number[],
    timeout?: number
  ): Promise<WriteMultipleRegistersResponse>;

  /**
   * Reads coils from the Modbus device.
   * @param startAddress - The starting address of the coils to read (0–65535).
   * @param quantity - The number of coils to read (1–2000).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to an array of booleans.
   */
  readCoils(startAddress: number, quantity: number, timeout?: number): Promise<ReadCoilsResponse>;

  /**
   * Reads discrete inputs from the Modbus device.
   * @param startAddress - The starting address of the discrete inputs to read (0–65535).
   * @param quantity - The number of discrete inputs to read (1–2000).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to an array of booleans.
   */
  readDiscreteInputs(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadDiscreteInputsResponse>;

  /**
   * Writes a single coil to the Modbus device.
   * @param address - The address of the coil to write (0–65535).
   * @param value - The value to write to the coil (boolean or 0/1).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the write operation response.
   */
  writeSingleCoil(
    address: number,
    value: boolean | number,
    timeout?: number
  ): Promise<WriteSingleCoilResponse>;

  /**
   * Writes multiple coils to the Modbus device.
   * @param startAddress - The starting address of the coils to write (0–65535).
   * @param values - An array of boolean values to write.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the write operation response.
   */
  writeMultipleCoils(
    startAddress: number,
    values: boolean[],
    timeout?: number
  ): Promise<WriteMultipleCoilsResponse>;

  /**
   * Reports the slave ID of the Modbus device.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the device's ID information.
   */
  reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse>;

  /**
   * Reads the device identification from the Modbus device.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the device's identification data.
   */
  readDeviceIdentification(timeout?: number): Promise<ReadDeviceIdentificationResponse>;
}

export = ModbusClient;
