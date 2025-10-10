// src/types/client.d.ts

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
} from './modbus-types.js';

declare class ModbusClient {
  constructor(transport: Transport, slaveId?: number, options?: ModbusClientOptions);

  /**
   * Включает логгер ModbusClient
   * @param level - Уровень логирования
   */
  enableLogger(level?: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void;

  /**
   * Отключает логгер ModbusClient (устанавливает самый высокий уровень - error)
   */
  disableLogger(): void;

  /**
   * Устанавливает контекст для логгера (slaveId, functionCode и т.д.)
   * @param context - Контекст для логгера
   */
  setLoggerContext(context: LoggerContext): void;

  /**
   * Establishes a connection to the Modbus transport.
   */
  connect(): Promise<void>;

  /**
   * Closes the connection to the Modbus transport.
   */
  disconnect(): Promise<void>;

  setSlaveId(slaveId: number): void;

  // --- Public method's Modbus ---

  /**
   * Reads holding registers from the Modbus device.
   */
  readHoldingRegisters(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions
  ): Promise<ConvertedRegisters>;

  /**
   * Reads input registers from the Modbus device.
   */
  readInputRegisters(
    startAddress: number,
    quantity: number,
    options?: ConvertRegisterOptions
  ): Promise<ConvertedRegisters>;

  /**
   * Writes a single register to the Modbus device.
   */
  writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<WriteSingleRegisterResponse>;

  /**
   * Writes multiple registers to the Modbus device.
   */
  writeMultipleRegisters(
    startAddress: number,
    values: number[],
    timeout?: number
  ): Promise<WriteMultipleRegistersResponse>;

  /**
   * Reads coils from the Modbus device.
   */
  readCoils(startAddress: number, quantity: number, timeout?: number): Promise<ReadCoilsResponse>;

  /**
   * Reads discrete inputs from the Modbus device.
   */
  readDiscreteInputs(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadDiscreteInputsResponse>;

  /**
   * Writes a single coil to the Modbus device.
   */
  writeSingleCoil(
    address: number,
    value: boolean | number,
    timeout?: number
  ): Promise<WriteSingleCoilResponse>;

  /**
   * Writes multiple coils to the Modbus device.
   */
  writeMultipleCoils(
    startAddress: number,
    values: boolean[],
    timeout?: number
  ): Promise<WriteMultipleCoilsResponse>;

  /**
   * Reports the slave ID of the Modbus device.
   */
  reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse>;

  /**
   * Reads the device identification from the Modbus device.
   */
  readDeviceIdentification(timeout?: number): Promise<ReadDeviceIdentificationResponse>;

  /**
   * Reads the file length from the Modbus device.
   */
  readFileLength(timeout?: number): Promise<ReadFileLengthResponse>;

  /**
   * Opens a file on the Modbus device.
   */
  openFile(filename: string, timeout?: number): Promise<OpenFileResponse>;

  /**
   * Closes a file on the Modbus device.
   */
  closeFile(timeout?: number): Promise<CloseFileResponse>;

  /**
   * Restarts the controller on the Modbus device.
   */
  restartController(timeout?: number): Promise<RestartControllerResponse>;

  /**
   * Gets the controller time from the Modbus device.
   */
  getControllerTime(timeout?: number): Promise<GetControllerTimeResponse>;

  /**
   * Sets the controller time on the Modbus device.
   */
  setControllerTime(datetime: Date, timeout?: number): Promise<SetControllerTimeResponse>;
}

export default ModbusClient;
