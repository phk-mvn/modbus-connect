// src/types/client.d.ts

import { RegisterType, ModbusFunctionCode } from '../constants/constants.js';
import { LogContext as LoggerContext } from '../logger.js';
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
  ControllerTime,
} from './modbus-types.js';

declare class ModbusClient {
  /**
   * Creates a new Modbus client instance.
   * @param transport - The transport interface for Modbus communication.
   * @param slaveId - The slave ID (1–255, default: 1).
   * @param options - Configuration options for the client.
   */
  constructor(transport: Transport, slaveId?: number, options?: ModbusClientOptions);

  /**
   * Включает логгер ModbusClient.
   * @param level - Уровень логирования (по умолчанию 'info').
   */
  enableLogger(level?: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void;

  /**
   * Отключает логгер ModbusClient (устанавливает уровень 'error').
   */
  disableLogger(): void;

  /**
   * Устанавливает контекст для логгера (slaveId, functionCode и т.д.).
   * @param context - Контекст для логгера.
   */
  setLoggerContext(context: LoggerContext): void;

  /**
   * Establishes a connection to the Modbus transport.
   * Logs the connection status upon successful connection.
   */
  connect(): Promise<void>;

  /**
   * Closes the connection to the Modbus transport.
   * Logs the disconnection status upon successful disconnection.
   */
  disconnect(): Promise<void>;

  /**
   * Sets the slave ID for the Modbus client.
   * @param slaveId - The slave ID (1–255).
   */
  setSlaveId(slaveId: number): void;

  // --- Public Modbus Methods ---

  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125 for Modbus standard).
   * @param options - The options for the read operation (e.g., register type).
   * @returns The converted registers based on the specified type.
   */
  readHoldingRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions
  ): Promise<ConvertedRegisters<T>>;

  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125 for Modbus standard).
   * @param options - The options for the read operation (e.g., register type).
   * @returns The converted registers based on the specified type.
   */
  readInputRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions
  ): Promise<ConvertedRegisters<T>>;

  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write (0–65535).
   * @param value - The value to write to the register (0–65535).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<WriteSingleRegisterResponse>;

  /**
   * Writes multiple registers to the Modbus device.
   * @param startAddress - The starting address of the registers to write (0–65535).
   * @param values - The values to write to the registers (each 0–65535).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  writeMultipleRegisters(
    startAddress: number,
    values: number[],
    timeout?: number
  ): Promise<WriteMultipleRegistersResponse>;

  /**
   * Reads coils from the Modbus device.
   * @param startAddress - The starting address of the coils to read (0–65535).
   * @param quantity - The number of coils to read (1–2000 for Modbus standard).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  readCoils(startAddress: number, quantity: number, timeout?: number): Promise<ReadCoilsResponse>;

  /**
   * Reads discrete inputs from the Modbus device.
   * @param startAddress - The starting address of the discrete inputs to read (0–65535).
   * @param quantity - The number of discrete inputs to read (1–2000 for Modbus standard).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
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
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  writeSingleCoil(
    address: number,
    value: boolean | number,
    timeout?: number
  ): Promise<WriteSingleCoilResponse>;

  /**
   * Writes multiple coils to the Modbus device.
   * @param startAddress - The starting address of the coils to write (0–65535).
   * @param values - The values to write to the coils.
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  writeMultipleCoils(
    startAddress: number,
    values: boolean[],
    timeout?: number
  ): Promise<WriteMultipleCoilsResponse>;

  /**
   * Reports the slave ID of the Modbus device.
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse>;

  /**
   * Reads the device identification from the Modbus device.
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  readDeviceIdentification(timeout?: number): Promise<ReadDeviceIdentificationResponse>;

  /**
   * Reads the file length from the Modbus device (SGM130).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  readFileLength(timeout?: number): Promise<ReadFileLengthResponse>;

  /**
   * Opens a file on the Modbus device (SGM130).
   * @param filename - The name of the file to open.
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  openFile(filename: string, timeout?: number): Promise<OpenFileResponse>;

  /**
   * Closes a file on the Modbus device (SGM130).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  closeFile(timeout?: number): Promise<CloseFileResponse>;

  /**
   * Restarts the controller on the Modbus device (SGM130).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  restartController(timeout?: number): Promise<RestartControllerResponse>;

  /**
   * Gets the controller time from the Modbus device (SGM130).
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  getControllerTime(timeout?: number): Promise<GetControllerTimeResponse>;

  /**
   * Sets the controller time on the Modbus device (SGM130).
   * @param datetime - The datetime to set on the controller.
   * @param timeout - The timeout in milliseconds (optional).
   * @returns The response from the Modbus device.
   */
  setControllerTime(datetime: Date, timeout?: number): Promise<SetControllerTimeResponse>;
}

export default ModbusClient;
