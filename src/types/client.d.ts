// src/types/client.d.ts

import { RegisterType } from '../constants/constants.js';
import { LogContext as LoggerContext } from './logger.js';
import {
  Transport,
  ModbusClientOptions,
  ConvertRegisterOptions,
  ReadCoilsResponse,
  ReadDiscreteInputsResponse,
  WriteSingleCoilResponse,
  WriteMultipleCoilsResponse,
  WriteSingleRegisterResponse,
  WriteMultipleRegistersResponse,
  ReportSlaveIdResponse,
  ReadDeviceIdentificationResponse,
  ReadFileLengthResponse,
  OpenFileResponse,
  CloseFileResponse,
  RestartControllerResponse,
  GetControllerTimeResponse,
  SetControllerTimeResponse,
  ConvertedRegisters,
  TransportControllerInterface,
} from './modbus-types.js';

declare class ModbusClient {
  /**
   * Creates a new Modbus client instance.
   * @param transportController - The TransportControllerInterface managing transports.
   * @param slaveId - The slave ID (1–255, default: 1).
   * @param options - Configuration options for the client.
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
   * Performs a logical connection check to ensure the client is ready for communication.
   * This method verifies that a transport is available and has been connected by the TransportController.
   * It does NOT initiate the physical connection itself.
   */
  connect(): Promise<void>;

  /**
   * Performs a logical disconnection for the client.
   * This method is a no-op regarding the physical transport layer.
   */
  disconnect(): Promise<void>;

  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125).
   * @param options - Options for the read operation, including register conversion type.
   * @returns A promise that resolves to the converted registers.
   */
  readHoldingRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions<T>
  ): Promise<ConvertedRegisters<T>>;

  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125).
   * @param options - Options for the read operation, including register conversion type.
   * @returns A promise that resolves to the converted registers.
   */
  readInputRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions<T>
  ): Promise<ConvertedRegisters<T>>;

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

  /**
   * Reads the file length from the Modbus device (SGM130 specific).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the file length.
   */
  readFileLength(timeout?: number): Promise<ReadFileLengthResponse>;

  /**
   * Opens a file on the Modbus device (SGM130 specific).
   * @param filename - The name of the file to open.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the open file response.
   */
  openFile(filename: string, timeout?: number): Promise<OpenFileResponse>;

  /**
   * Closes a file on the Modbus device (SGM130 specific).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the close file response.
   */
  closeFile(timeout?: number): Promise<CloseFileResponse>;

  /**
   * Restarts the controller on the Modbus device (SGM130 specific).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the restart operation response.
   */
  restartController(timeout?: number): Promise<RestartControllerResponse>;

  /**
   * Gets the controller time from the Modbus device (SGM130 specific).
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the controller's time.
   */
  getControllerTime(timeout?: number): Promise<GetControllerTimeResponse>;

  /**
   * Sets the controller time on the Modbus device (SGM130 specific).
   * @param datetime - The Date object to set on the controller.
   * @param timeout - Optional timeout in milliseconds.
   * @returns A promise that resolves to the set time operation response.
   */
  setControllerTime(datetime: Date, timeout?: number): Promise<SetControllerTimeResponse>;
}

export = ModbusClient;
