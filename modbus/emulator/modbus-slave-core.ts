// modbus/emulator/modbus-slave-core.ts

import { Logger, pino } from 'pino';
import {
  ModbusDataConversionError,
  ModbusExceptionError,
  ModbusIllegalDataAddressError,
  ModbusIllegalDataValueError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
} from '../errors';
import {
  IInfinityChangeParams,
  IStopInfinityChangeParams,
  IRegisterDefinitions,
  IModbusSlaveCoreEmulator,
} from '../types/modbus-types';
import { ModbusFunctionCode } from '../constants/constants';

/**
 * Core Modbus Slave Emulator.
 *
 * This class implements the core logic of a Modbus RTU/TCP slave device.
 * It maintains four memory areas (Coils, Discrete Inputs, Holding Registers, Input Registers)
 * and supports all standard Modbus function codes for reading and writing.
 *
 * It also provides advanced features such as:
 * - Configurable exceptions per function code and address
 * - Infinite random value changing for simulation purposes
 * - Comprehensive validation and error handling according to Modbus specification
 */
class ModbusSlaveCore implements IModbusSlaveCoreEmulator {
  public readonly slaveId: number;

  private coils: Map<number, boolean> = new Map();
  private discreteInputs: Map<number, boolean> = new Map();
  private holdingRegisters: Map<number, number> = new Map();
  private inputRegisters: Map<number, number> = new Map();

  private exceptions: Map<string, number> = new Map();
  private _infinityTasks: Map<string, NodeJS.Timeout> = new Map();

  public readonly logger: Logger;
  private readonly loggerEnabled: boolean;

  /**
   * Creates a new Modbus Slave Core instance.
   *
   * @param slaveId - Modbus slave address (Unit ID). Must be an integer between 0 and 247 (default: 1).
   * @param options - Configuration options
   * @param options.loggerEnabled - Whether to enable logging (default: false). Note: logger is always created, but output depends on this flag and environment.
   * @throws {ModbusInvalidAddressError} If slaveId is invalid.
   */
  constructor(slaveId: number = 1, options: { loggerEnabled?: boolean } = {}) {
    if (typeof slaveId !== 'number' || !Number.isInteger(slaveId) || slaveId < 0 || slaveId > 247) {
      throw new ModbusInvalidAddressError(slaveId);
    }

    this.slaveId = slaveId;
    this.loggerEnabled = !!options.loggerEnabled;

    this.logger = pino({
      level: 'info',
      base: { component: 'ModbusSlaveCore', slaveId: this.slaveId },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,slaveId',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    this.logger.info(`ModbusSlaveCore initialized successfully (Slave ID: ${slaveId})`);
  }

  /**
   * Central method for processing incoming Modbus PDU.
   * This is the main entry point used by transport layers (RTU, TCP, etc.).
   * @param unitId - Received Unit ID (slave address)
   * @param pdu - Modbus Protocol Data Unit (function code + data)
   * @returns Response PDU (normal response or exception response)
   * @throws {Error} If unitId does not match this slave (unless unitId === 0 for broadcast)
   */
  public async processRequest(unitId: number, pdu: Uint8Array): Promise<Uint8Array> {
    if (unitId !== 0 && unitId !== this.slaveId) {
      throw new Error(`Slave ID mismatch: expected ${this.slaveId}, got ${unitId}`);
    }

    const functionCode = pdu[0];

    try {
      switch (functionCode) {
        case ModbusFunctionCode.READ_COILS:
          return this.handleReadCoils(pdu);
        case ModbusFunctionCode.READ_DISCRETE_INPUTS:
          return this.handleReadDiscreteInputs(pdu);
        case ModbusFunctionCode.READ_HOLDING_REGISTERS:
          return this.handleReadHoldingRegisters(pdu);
        case ModbusFunctionCode.READ_INPUT_REGISTERS:
          return this.handleReadInputRegisters(pdu);
        case ModbusFunctionCode.WRITE_SINGLE_COIL:
          return this.handleWriteSingleCoil(pdu);
        case ModbusFunctionCode.WRITE_SINGLE_REGISTER:
          return this.handleWriteSingleRegister(pdu);
        case ModbusFunctionCode.WRITE_MULTIPLE_COILS:
          return this.handleWriteMultipleCoils(pdu);
        case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
          return this.handleWriteMultipleRegisters(pdu);

        default:
          this.logger.warn(`Unsupported function code: 0x${functionCode.toString(16)}`);
          throw new ModbusExceptionError(functionCode, 0x01); // Illegal Function
      }
    } catch (err: any) {
      if (err instanceof ModbusExceptionError) {
        // Возвращаем Exception Response: functionCode | 0x80 + exception code
        return new Uint8Array([functionCode | 0x80, err.exceptionCode]);
      }

      this.logger.error(
        err,
        `Unexpected error while processing function code 0x${functionCode.toString(16)}`
      );
      // По умолчанию возвращаем Illegal Function
      return new Uint8Array([functionCode | 0x80, 0x01]);
    }
  }

  /**
   * Handles Modbus function code 0x01 - Read Coils.
   * @private
   */
  private handleReadCoils(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_COILS, addr);
    }

    const values = this.readCoils(startAddress, quantity);
    const byteCount = Math.ceil(quantity / 8);

    const response = new Uint8Array(2 + byteCount);
    response[0] = ModbusFunctionCode.READ_COILS;
    response[1] = byteCount;

    for (let i = 0; i < quantity; i++) {
      if (values[i]) {
        const byteIndex = 2 + Math.floor(i / 8);
        const bitIndex = i % 8;
        response[byteIndex] |= 1 << bitIndex;
      }
    }

    return response;
  }

  /**
   * Handles Modbus function code 0x02 - Read Discrete Inputs.
   * @private
   */
  private handleReadDiscreteInputs(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_DISCRETE_INPUTS, addr);
    }

    const values = this.readDiscreteInputs(startAddress, quantity);
    const byteCount = Math.ceil(quantity / 8);

    const response = new Uint8Array(2 + byteCount);
    response[0] = ModbusFunctionCode.READ_DISCRETE_INPUTS;
    response[1] = byteCount;

    for (let i = 0; i < quantity; i++) {
      if (values[i]) {
        const byteIndex = 2 + Math.floor(i / 8);
        const bitIndex = i % 8;
        response[byteIndex] |= 1 << bitIndex;
      }
    }

    return response;
  }

  /**
   * Handles Modbus function code 0x03 - Read Holding Registers.
   * @private
   */
  private handleReadHoldingRegisters(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
    }

    const values = this.readHoldingRegisters(startAddress, quantity);
    const byteCount = quantity * 2;

    const response = new Uint8Array(2 + byteCount);
    response[0] = ModbusFunctionCode.READ_HOLDING_REGISTERS;
    response[1] = byteCount;

    for (let i = 0; i < quantity; i++) {
      response[2 + i * 2] = (values[i] >> 8) & 0xff;
      response[3 + i * 2] = values[i] & 0xff;
    }

    return response;
  }

  /**
   * Handles Modbus function code 0x04 - Read Input Registers.
   * @private
   */
  private handleReadInputRegisters(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
    }

    const values = this.readInputRegisters(startAddress, quantity);
    const byteCount = quantity * 2;

    const response = new Uint8Array(2 + byteCount);
    response[0] = ModbusFunctionCode.READ_INPUT_REGISTERS;
    response[1] = byteCount;

    for (let i = 0; i < quantity; i++) {
      response[2 + i * 2] = (values[i] >> 8) & 0xff;
      response[3 + i * 2] = values[i] & 0xff;
    }

    return response;
  }

  /**
   * Handles Modbus function code 0x05 - Write Single Coil.
   * @private
   */
  private handleWriteSingleCoil(pdu: Uint8Array): Uint8Array {
    const address = (pdu[1] << 8) | pdu[2];
    const value = pdu[3] === 0xff && pdu[4] === 0x00;

    this.writeSingleCoil(address, value);
    return new Uint8Array(pdu); // Echo response
  }

  /**
   * Handles Modbus function code 0x06 - Write Single Register.
   * @private
   */
  private handleWriteSingleRegister(pdu: Uint8Array): Uint8Array {
    const address = (pdu[1] << 8) | pdu[2];
    const value = (pdu[3] << 8) | pdu[4];

    this.writeSingleRegister(address, value);
    return new Uint8Array(pdu); // Echo response
  }

  /**
   * Handles Modbus function code 0x0F - Write Multiple Coils.
   * @private
   */
  private handleWriteMultipleCoils(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];
    const byteCount = pdu[5];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 1968);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    const values: boolean[] = [];
    for (let i = 0; i < quantity; i++) {
      const byteIdx = 6 + Math.floor(i / 8);
      const bitIdx = i % 8;
      values.push((pdu[byteIdx] & (1 << bitIdx)) !== 0);
    }

    values.forEach((val, idx) => {
      this._validateValue(val, false);
      this._checkException(ModbusFunctionCode.WRITE_MULTIPLE_COILS, startAddress + idx);
      this._setCoil(startAddress + idx, val);
    });

    // Response: Start Address + Quantity
    const response = new Uint8Array(5);
    response[0] = ModbusFunctionCode.WRITE_MULTIPLE_COILS;
    response[1] = (startAddress >> 8) & 0xff;
    response[2] = startAddress & 0xff;
    response[3] = (quantity >> 8) & 0xff;
    response[4] = quantity & 0xff;

    return response;
  }

  /**
   * Handles Modbus function code 0x10 - Write Multiple Registers.
   * @private
   */
  private handleWriteMultipleRegisters(pdu: Uint8Array): Uint8Array {
    const startAddress = (pdu[1] << 8) | pdu[2];
    const quantity = (pdu[3] << 8) | pdu[4];
    const byteCount = pdu[5];

    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 123);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let i = 0; i < quantity; i++) {
      const value = (pdu[6 + i * 2] << 8) | pdu[7 + i * 2];
      this._validateValue(value, true);
      this._checkException(ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, startAddress + i);
      this._setHoldingRegister(startAddress + i, value);
    }

    // Response: Start Address + Quantity
    const response = new Uint8Array(5);
    response[0] = ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS;
    response[1] = (startAddress >> 8) & 0xff;
    response[2] = startAddress & 0xff;
    response[3] = (quantity >> 8) & 0xff;
    response[4] = quantity & 0xff;

    return response;
  }

  /**
   * Reads multiple coils (function code 0x01).
   *
   * @param startAddress - Starting address of the coils to read (0..65535)
   * @param quantity - Number of coils to read (1..2000)
   * @returns Array of boolean values representing coil states
   * @throws {ModbusInvalidAddressError} If address is invalid
   * @throws {ModbusInvalidQuantityError} If quantity is out of valid range
   * @throws {ModbusIllegalDataAddressError} If address range exceeds 0xFFFF
   * @throws {ModbusExceptionError} If an exception was configured for any address in the range
   */
  public readCoils(startAddress: number, quantity: number): boolean[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_COILS, addr);
    }

    const result: boolean[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this._getCoil(startAddress + i));
    }
    return result;
  }

  /**
   * Reads multiple discrete inputs (function code 0x02).
   * @param startAddress - Starting address of the discrete inputs (0..65535)
   * @param quantity - Number of inputs to read (1..2000)
   * @returns Array of boolean values
   * @throws Same exceptions as {@link readCoils}
   */
  public readDiscreteInputs(startAddress: number, quantity: number): boolean[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_DISCRETE_INPUTS, addr);
    }

    const result: boolean[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this._getDiscreteInput(startAddress + i));
    }
    return result;
  }

  /**
   * Reads multiple holding registers (function code 0x03).
   * @param startAddress - Starting address (0..65535)
   * @param quantity - Number of registers to read (1..125)
   * @returns Array of 16-bit unsigned integer values (0..65535)
   * @throws Same exceptions as {@link readCoils}
   */
  public readHoldingRegisters(startAddress: number, quantity: number): number[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this._getHoldingRegister(startAddress + i));
    }
    return result;
  }

  /**
   * Reads multiple input registers (function code 0x04).
   * @param startAddress - Starting address (0..65535)
   * @param quantity - Number of registers to read (1..125)
   * @returns Array of 16-bit unsigned integer values
   * @throws Same exceptions as {@link readCoils}
   */
  public readInputRegisters(startAddress: number, quantity: number): number[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this._getInputRegister(startAddress + i));
    }
    return result;
  }

  /**
   * Writes a single coil (function code 0x05).
   * @param address - Coil address (0..65535)
   * @param value - New coil value (true = ON, false = OFF)
   * @throws {ModbusInvalidAddressError}
   * @throws {ModbusIllegalDataValueError} If value is not boolean
   * @throws {ModbusExceptionError} If exception is configured for this address
   */
  public writeSingleCoil(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);
    this._checkException(ModbusFunctionCode.WRITE_SINGLE_COIL, address);
    this._setCoil(address, value);
  }

  /**
   * Writes a single holding register (function code 0x06).
   * @param address - Register address (0..65535)
   * @param value - New register value (0..65535)
   * @throws {ModbusInvalidAddressError}
   * @throws {ModbusIllegalDataValueError} If value is not a valid 16-bit integer
   * @throws {ModbusExceptionError}
   */
  public writeSingleRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);
    this._checkException(ModbusFunctionCode.WRITE_SINGLE_REGISTER, address);
    this._setHoldingRegister(address, value);
  }

  /**
   * Bulk adds initial values for multiple registers and coils.
   * @param definitions - Object containing arrays of {start, value} for each memory type
   * @throws {ModbusDataConversionError} If definitions format is invalid
   */
  public addRegisters(definitions: IRegisterDefinitions): void {
    if (!definitions || typeof definitions !== 'object') {
      throw new ModbusDataConversionError(definitions, 'valid object');
    }

    const stats = { coils: 0, discrete: 0, holding: 0, input: 0 };

    try {
      if (Array.isArray(definitions.coils)) {
        for (const { start, value } of definitions.coils) {
          this._setCoil(start, value as boolean);
          stats.coils++;
        }
      }

      if (Array.isArray(definitions.discrete)) {
        for (const { start, value } of definitions.discrete) {
          this._setDiscreteInput(start, value as boolean);
          stats.discrete++;
        }
      }

      if (Array.isArray(definitions.holding)) {
        for (const { start, value } of definitions.holding) {
          this._setHoldingRegister(start, value as number);
          stats.holding++;
        }
      }

      if (Array.isArray(definitions.input)) {
        for (const { start, value } of definitions.input) {
          this._setInputRegister(start, value as number);
          stats.input++;
        }
      }

      this.logger.info(`Registers added successfully: ${JSON.stringify(stats)}`);
    } catch (err: any) {
      this.logger.error(err, 'Failed to add registers');
      throw err;
    }
  }

  /**
   * Starts an infinite random value change task for a specific register/coil.
   * Useful for simulating changing sensor values or dynamic data.
   * @param params - Parameters for the infinite change task
   * @throws {ModbusDataConversionError} If parameters are invalid
   */
  public infinityChange(params: IInfinityChangeParams): void {
    const { typeRegister, register, range, interval } = params;

    if (
      !typeRegister ||
      typeof register !== 'number' ||
      !Array.isArray(range) ||
      range.length !== 2
    ) {
      throw new ModbusDataConversionError(params, 'valid parameters');
    }

    if (typeof interval !== 'number' || interval <= 0) {
      throw new ModbusDataConversionError(interval, 'positive number');
    }

    const key = `${typeRegister}:${register}`;
    this.stopInfinityChange({ typeRegister, register });

    const [min, max] = range;
    if (min > max) {
      throw new ModbusDataConversionError(range, 'min <= max required');
    }

    const setters: Record<string, (addr: number, val: number | boolean) => void> = {
      Holding: (addr, val) => this._setHoldingRegister(addr, val as number),
      Input: (addr, val) => this._setInputRegister(addr, val as number),
      Coil: (addr, val) => this._setCoil(addr, val as boolean),
      Discrete: (addr, val) => this._setDiscreteInput(addr, val as boolean),
    };

    const setter = setters[typeRegister];
    if (!setter) {
      throw new ModbusDataConversionError(typeRegister, 'valid register type');
    }

    const intervalId = setInterval(() => {
      try {
        const value =
          typeRegister === 'Holding' || typeRegister === 'Input'
            ? Math.floor(Math.random() * (max - min + 1)) + min
            : Math.random() < 0.5;

        setter(register, value);
        this.logger.debug(`Infinity change: ${typeRegister}[${register}] = ${value}`);
      } catch (err: any) {
        this.logger.error(err, `Error in infinity change task for ${typeRegister}[${register}]`);
      }
    }, interval);

    this._infinityTasks.set(key, intervalId);
    this.logger.info(
      `Infinity change started for ${typeRegister}[${register}] (interval: ${interval}ms)`
    );
  }

  /**
   * Stops an active infinite change task for a specific register.
   * @param params - Parameters identifying the task to stop
   */
  public stopInfinityChange(params: IStopInfinityChangeParams): void {
    const key = `${params.typeRegister}:${params.register}`;

    if (this._infinityTasks.has(key)) {
      const intervalId = this._infinityTasks.get(key);
      if (intervalId) clearInterval(intervalId);
      this._infinityTasks.delete(key);
      this.logger.debug(`Infinity change stopped for ${key}`);
    }
  }

  /**
   * Configures a custom Modbus exception for a specific function code and address.
   * @param functionCode - Modbus function code
   * @param address - Address to trigger the exception on
   * @param exceptionCode - Exception code to return (1..4 typically)
   * @throws {ModbusInvalidAddressError} If address is invalid
   */
  public setException(functionCode: number, address: number, exceptionCode: number): void {
    this._validateAddress(address);
    this.exceptions.set(`${functionCode}_${address}`, exceptionCode);
    this.logger.info(
      `Exception set: functionCode=0x${functionCode.toString(16)}, address=${address}, exceptionCode=0x${exceptionCode.toString(16)}`
    );
  }

  /**
   * Clears all registers, configured exceptions, and stops all infinity change tasks.
   */
  public clearAll(): void {
    this.coils.clear();
    this.discreteInputs.clear();
    this.holdingRegisters.clear();
    this.inputRegisters.clear();
    this.exceptions.clear();

    for (const id of this._infinityTasks.values()) {
      clearInterval(id);
    }
    this._infinityTasks.clear();

    this.logger.info('All registers, exceptions and infinity tasks cleared');
  }

  /**
   * Validates that the address is a valid 16-bit unsigned integer (0..0xFFFF).
   * @private
   * @throws {ModbusInvalidAddressError}
   */
  private _validateAddress(address: number): void {
    if (
      typeof address !== 'number' ||
      !Number.isInteger(address) ||
      address < 0 ||
      address > 0xffff
    ) {
      throw new ModbusInvalidAddressError(address);
    }
  }

  /**
   * Validates quantity according to Modbus specification limits for the given function.
   * @private
   * @throws {ModbusInvalidQuantityError}
   */
  private _validateQuantity(quantity: number, max: number = 125): void {
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > max
    ) {
      throw new ModbusInvalidQuantityError(quantity, 1, max);
    }
  }

  /**
   * Validates the value being written to a coil or register.
   * @private
   * @throws {ModbusIllegalDataValueError}
   */
  private _validateValue(value: unknown, isRegister: boolean = false): void {
    if (isRegister) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new ModbusIllegalDataValueError(String(value), 'integer between 0 and 65535');
      }
    } else {
      if (typeof value !== 'boolean') {
        throw new ModbusIllegalDataValueError(String(value), 'boolean');
      }
    }
  }

  /**
   * Checks if an exception is configured for the given function code and address.
   * If yes — throws the corresponding ModbusExceptionError.
   * @private
   */
  private _checkException(functionCode: number, address: number): void {
    this._validateAddress(address);
    const key = `${functionCode}_${address}`;
    if (this.exceptions.has(key)) {
      const exCode = this.exceptions.get(key)!;
      this.logger.warn(
        `Throwing exception for function 0x${functionCode.toString(16)} at address ${address}: code 0x${exCode.toString(16)}`
      );
      throw new ModbusExceptionError(functionCode, exCode);
    }
  }

  /**
   * Internal method to set a coil value.
   * @private
   */
  private _setCoil(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);
    this.coils.set(address, !!value);
  }

  /**
   * Internal method to get a coil value.
   * @private
   */
  private _getCoil(address: number): boolean {
    this._validateAddress(address);
    return this.coils.get(address) ?? false;
  }

  /**
   * Internal method to set a discrete input value.
   * @private
   */
  private _setDiscreteInput(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);
    this.discreteInputs.set(address, !!value);
  }

  /**
   * Internal method to get a discrete input value.
   * @private
   */
  private _getDiscreteInput(address: number): boolean {
    this._validateAddress(address);
    return this.discreteInputs.get(address) ?? false;
  }

  /**
   * Internal method to set a holding register value.
   * @private
   */
  private _setHoldingRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);
    const maskedValue = value & 0xffff;
    this.holdingRegisters.set(address, maskedValue);
  }

  /**
   * Internal method to get a holding register value.
   * @private
   */
  private _getHoldingRegister(address: number): number {
    this._validateAddress(address);
    return this.holdingRegisters.get(address) ?? 0;
  }

  /**
   * Internal method to set an input register value.
   * @private
   */
  private _setInputRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);
    const maskedValue = value & 0xffff;
    this.inputRegisters.set(address, maskedValue);
  }

  /**
   * Internal method to get an input register value.
   * @private
   */
  private _getInputRegister(address: number): number {
    this._validateAddress(address);
    return this.inputRegisters.get(address) ?? 0;
  }
}

export = ModbusSlaveCore;
