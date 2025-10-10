// slave-emulator/slave-emulator.ts

import Logger from '../logger.js';
import {
  LoggerInstance,
  LogContext as LoggerContext,
  InfinityChangeParams,
  StopInfinityChangeParams,
  SlaveEmulatorOptions,
  RegisterDefinitions,
} from '../types/modbus-types.js';
import { FUNCTION_CODES } from '../constants/constants.js';
import { ModbusExceptionError } from '../errors.js';
import { crc16Modbus } from '../utils/crc.js';

class SlaveEmulator {
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

  constructor(slaveAddress: number = 1, options: SlaveEmulatorOptions = {}) {
    // Валидация адреса
    if (typeof slaveAddress !== 'number' || slaveAddress < 0 || slaveAddress > 247) {
      throw new Error('Slave address must be a number between 0 and 247');
    }
    this.slaveAddress = slaveAddress;

    this.coils = new Map();
    this.discreteInputs = new Map();
    this.holdingRegisters = new Map();
    this.inputRegisters = new Map();
    this.exceptions = new Map();
    this._infinityTasks = new Map();

    // Инициализация логгера с учетом флага
    this.loggerEnabled = !!options.loggerEnabled;
    const loggerInstance = new Logger();
    this.logger = loggerInstance.createLogger('SlaveEmulator');
    if (!this.loggerEnabled) {
      this.logger.setLevel('error');
    } else {
      this.logger.setLevel('info');
    }

    this.connected = false;
  }

  // Методы для управления логгером
  enableLogger(): void {
    if (!this.loggerEnabled) {
      this.loggerEnabled = true;
      this.logger.setLevel('info');
    }
  }

  disableLogger(): void {
    if (this.loggerEnabled) {
      this.loggerEnabled = false;
      this.logger.setLevel('error');
    }
  }

  async connect(): Promise<void> {
    this.logger.info('Connecting to emulator...', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
    this.connected = true;
    this.logger.info('Connected', { slaveAddress: this.slaveAddress } as LoggerContext);
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from emulator...', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
    this.connected = false;
    this.logger.info('Disconnected', { slaveAddress: this.slaveAddress } as LoggerContext);
  }

  // Валидация методов
  private _validateAddress(address: number): void {
    if (typeof address !== 'number' || address < 0 || address > 0xffff) {
      throw new Error(`Invalid address: ${address}. Must be between 0 and 65535`);
    }
  }

  private _validateQuantity(quantity: number, max: number = 125): void {
    if (typeof quantity !== 'number' || quantity <= 0 || quantity > max) {
      throw new Error(`Invalid quantity: ${quantity}. Must be between 1 and ${max}`);
    }
  }

  private _validateValue(value: any, isRegister: boolean = false): void {
    if (isRegister) {
      if (typeof value !== 'number' || value < 0 || value > 0xffff) {
        throw new Error(`Invalid register value: ${value}. Must be between 0 and 65535`);
      }
    } else {
      if (typeof value !== 'boolean') {
        throw new Error(`Invalid coil value: ${value}. Must be boolean`);
      }
    }
  }

  infinityChange(params: InfinityChangeParams): void {
    const { typeRegister, register, range, interval } = params;

    // Валидация параметров
    if (
      !typeRegister ||
      typeof register !== 'number' ||
      !Array.isArray(range) ||
      range.length !== 2
    ) {
      throw new Error('Invalid parameters for infinityChange');
    }

    if (typeof interval !== 'number' || interval <= 0) {
      throw new Error('Interval must be a positive number');
    }

    const key = `${typeRegister}:${register}`;

    // Остановка существующей задачи
    this.stopInfinityChange({ typeRegister, register });

    const [min, max] = range;

    const setters = {
      Holding: (addr: number, val: number | boolean) =>
        this.setHoldingRegister(addr, val as number),
      Input: (addr: number, val: number | boolean) => this.setInputRegister(addr, val as number),
      Coil: (addr: number, val: number | boolean) => this.setCoil(addr, val as boolean),
      Discrete: (addr: number, val: number | boolean) =>
        this.setDiscreteInput(addr, val as boolean),
    };

    const setter = setters[typeRegister];
    if (!setter) {
      throw new Error(`Invalid register type: ${typeRegister}`);
    }

    // Валидация диапазона
    if (min > max) {
      throw new Error('Min value cannot be greater than max value');
    }

    const intervalId = setInterval(() => {
      try {
        const value =
          typeRegister === 'Holding' || typeRegister === 'Input'
            ? Math.floor(Math.random() * (max - min + 1)) + min
            : Math.random() < 0.5;

        setter(register, value);
        this.logger.debug('Infinity change updated', {
          typeRegister,
          register,
          value,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } catch (error: any) {
        this.logger.error('Error in infinity change task', {
          error: error.message,
          typeRegister,
          register,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      }
    }, interval);

    this._infinityTasks.set(key, intervalId);
    this.logger.info('Infinity change started', {
      typeRegister,
      register,
      interval,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  stopInfinityChange(params: StopInfinityChangeParams): void {
    const { typeRegister, register } = params;
    const key = `${typeRegister}:${register}`;
    if (this._infinityTasks.has(key)) {
      const intervalId = this._infinityTasks.get(key);
      if (intervalId) {
        clearInterval(intervalId);
      }
      this._infinityTasks.delete(key);
      this.logger.debug('Infinity change stopped', {
        typeRegister,
        register,
        slaveAddress: this.slaveAddress,
      } as LoggerContext);
    }
  }

  setException(functionCode: number, address: number, exceptionCode: number): void {
    this._validateAddress(address);

    this.exceptions.set(`${functionCode}_${address}`, exceptionCode);
    this.logger.info(
      `Exception set: functionCode=0x${functionCode.toString(16)}, address=${address}, exceptionCode=0x${exceptionCode.toString(16)}`,
      {
        functionCode: `0x${functionCode.toString(16)}`,
        address,
        exceptionCode,
        slaveAddress: this.slaveAddress,
      } as LoggerContext
    );
  }

  private _checkException(functionCode: number, address: number): void {
    this._validateAddress(address);

    const key = `${functionCode}_${address}`;
    if (this.exceptions.has(key)) {
      const exCode = this.exceptions.get(key)!;
      this.logger.warn(
        `Throwing exception for function 0x${functionCode.toString(16)} at address ${address}: code 0x${exCode.toString(16)}`,
        {
          functionCode: `0x${functionCode.toString(16)}`,
          address,
          exceptionCode: exCode,
          slaveAddress: this.slaveAddress,
        } as LoggerContext
      );
      throw new ModbusExceptionError(functionCode, exCode);
    }
  }

  addRegisters(definitions: RegisterDefinitions): void {
    if (!definitions || typeof definitions !== 'object') {
      throw new Error('Definitions must be an object');
    }

    const stats = { coils: 0, discrete: 0, holding: 0, input: 0 };

    try {
      if (Array.isArray(definitions.coils)) {
        for (const { start, value } of definitions.coils) {
          this.setCoil(start, value as boolean);
          stats.coils++;
        }
      }

      if (Array.isArray(definitions.discrete)) {
        for (const { start, value } of definitions.discrete) {
          this.setDiscreteInput(start, value as boolean);
          stats.discrete++;
        }
      }

      if (Array.isArray(definitions.holding)) {
        for (const { start, value } of definitions.holding) {
          this.setHoldingRegister(start, value as number);
          stats.holding++;
        }
      }

      if (Array.isArray(definitions.input)) {
        for (const { start, value } of definitions.input) {
          this.setInputRegister(start, value as number);
          stats.input++;
        }
      }

      this.logger.info('Registers added successfully', {
        ...stats,
        slaveAddress: this.slaveAddress,
      } as LoggerContext);
    } catch (error: any) {
      this.logger.error('Error adding registers', {
        error: error.message,
        definitions: JSON.stringify(definitions),
        slaveAddress: this.slaveAddress,
      } as LoggerContext);
      throw error;
    }
  }

  setCoil(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);

    this.coils.set(address, !!value);
    this.logger.debug('Coil set', {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  getCoil(address: number): boolean {
    this._validateAddress(address);
    return this.coils.get(address) || false;
  }

  readCoils(startAddress: number, quantity: number): boolean[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000); // Максимум 2000 coils за запрос

    // Проверка на переполнение адресов
    if (startAddress + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    this.logger.info('readCoils', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(FUNCTION_CODES.READ_COILS, addr);
    }

    const result: boolean[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getCoil(startAddress + i));
    }
    return result;
  }

  writeSingleCoil(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);

    this._checkException(FUNCTION_CODES.WRITE_SINGLE_COIL, address);
    this.setCoil(address, value);
    this.logger.info('writeSingleCoil', {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  writeMultipleCoils(startAddress: number, values: boolean[]): void {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 1968); // Максимум 1968 coils за запрос

    if (!Array.isArray(values)) {
      throw new Error('Values must be an array');
    }

    // Проверка на переполнение адресов
    if (startAddress + values.length > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    values.forEach((val, idx) => {
      this._validateValue(val, false);
      this._checkException(FUNCTION_CODES.WRITE_MULTIPLE_COILS, startAddress + idx);
    });

    values.forEach((val, idx) => {
      this.setCoil(startAddress + idx, val);
    });

    this.logger.info('writeMultipleCoils', {
      startAddress,
      values: values.length,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  setDiscreteInput(address: number, value: boolean): void {
    this._validateAddress(address);
    this._validateValue(value, false);

    this.discreteInputs.set(address, !!value);
    this.logger.debug('Discrete Input set', {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  getDiscreteInput(address: number): boolean {
    this._validateAddress(address);
    return this.discreteInputs.get(address) || false;
  }

  readDiscreteInputs(startAddress: number, quantity: number): boolean[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2000); // Максимум 2000 inputs за запрос

    // Проверка на переполнение адресов
    if (startAddress + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    this.logger.info('readDiscreteInputs', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(FUNCTION_CODES.READ_DISCRETE_INPUTS, addr);
    }

    const result: boolean[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getDiscreteInput(startAddress + i));
    }
    return result;
  }

  setHoldingRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);

    const maskedValue = value & 0xffff;
    this.holdingRegisters.set(address, maskedValue);
    this.logger.debug('Holding Register set', {
      address,
      value: maskedValue,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  getHoldingRegister(address: number): number {
    this._validateAddress(address);
    return this.holdingRegisters.get(address) || 0;
  }

  readHoldingRegisters(startAddress: number, quantity: number): number[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125); // Максимум 125 регистров за запрос

    // Проверка на переполнение адресов
    if (startAddress + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    this.logger.info('readHoldingRegisters', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(FUNCTION_CODES.READ_HOLDING_REGISTERS, addr);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getHoldingRegister(startAddress + i));
    }
    return result;
  }

  writeSingleRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);

    this._checkException(FUNCTION_CODES.WRITE_SINGLE_REGISTER, address);
    this.setHoldingRegister(address, value);
    this.logger.info('writeSingleRegister', {
      address,
      value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  writeMultipleRegisters(startAddress: number, values: number[]): void {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 123); // Максимум 123 регистра за запрос

    if (!Array.isArray(values)) {
      throw new Error('Values must be an array');
    }

    // Проверка на переполнение адресов
    if (startAddress + values.length > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    values.forEach((val, idx) => {
      this._validateValue(val, true);
      this._checkException(FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS, startAddress + idx);
    });

    values.forEach((val, idx) => {
      this.setHoldingRegister(startAddress + idx, val);
    });

    this.logger.info('writeMultipleRegisters', {
      startAddress,
      values: values.length,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  setInputRegister(address: number, value: number): void {
    this._validateAddress(address);
    this._validateValue(value, true);

    const maskedValue = value & 0xffff;
    this.inputRegisters.set(address, maskedValue);
    this.logger.debug('Input Register set', {
      address,
      value: maskedValue,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  getInputRegister(address: number): number {
    this._validateAddress(address);
    return this.inputRegisters.get(address) || 0;
  }

  readInputRegisters(startAddress: number, quantity: number): number[] {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125); // Максимум 125 регистров за запрос

    // Проверка на переполнение адресов
    if (startAddress + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    this.logger.info('readInputRegisters', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(FUNCTION_CODES.READ_INPUT_REGISTERS, addr);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getInputRegister(startAddress + i));
    }
    return result;
  }

  // --- Прямые методы (без RTU) ---

  readHolding(start: number, quantity: number): number[] {
    this._validateAddress(start);
    this._validateQuantity(quantity, 125);

    // Проверка на переполнение адресов
    if (start + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(FUNCTION_CODES.READ_HOLDING_REGISTERS, addr);
      result.push(this.getHoldingRegister(addr));
    }
    return result;
  }

  readInput(start: number, quantity: number): number[] {
    this._validateAddress(start);
    this._validateQuantity(quantity, 125);

    // Проверка на переполнение адресов
    if (start + quantity > 0x10000) {
      throw new Error('Address range exceeds maximum address space');
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(FUNCTION_CODES.READ_INPUT_REGISTERS, addr);
      result.push(this.getInputRegister(addr));
    }
    return result;
  }

  // --- Методы диагностики и мониторинга ---

  getRegisterStats(): {
    coils: number;
    discreteInputs: number;
    holdingRegisters: number;
    inputRegisters: number;
    exceptions: number;
    infinityTasks: number;
  } {
    return {
      coils: this.coils.size,
      discreteInputs: this.discreteInputs.size,
      holdingRegisters: this.holdingRegisters.size,
      inputRegisters: this.inputRegisters.size,
      exceptions: this.exceptions.size,
      infinityTasks: this._infinityTasks.size,
    };
  }

  getRegisterDump(): {
    coils: { [key: number]: boolean };
    discreteInputs: { [key: number]: boolean };
    holdingRegisters: { [key: number]: number };
    inputRegisters: { [key: number]: number };
  } {
    return {
      coils: Object.fromEntries(this.coils),
      discreteInputs: Object.fromEntries(this.discreteInputs),
      holdingRegisters: Object.fromEntries(this.holdingRegisters),
      inputRegisters: Object.fromEntries(this.inputRegisters),
    };
  }

  getInfinityTasks(): string[] {
    return Array.from(this._infinityTasks.keys());
  }

  clearAllRegisters(): void {
    this.coils.clear();
    this.discreteInputs.clear();
    this.holdingRegisters.clear();
    this.inputRegisters.clear();
    this.logger.info('All registers cleared', { slaveAddress: this.slaveAddress } as LoggerContext);
  }

  clearExceptions(): void {
    this.exceptions.clear();
    this.logger.info('All exceptions cleared', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  clearInfinityTasks(): void {
    for (const intervalId of this._infinityTasks.values()) {
      clearInterval(intervalId);
    }
    this._infinityTasks.clear();
    this.logger.info('All infinity tasks cleared', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  // --- Graceful shutdown ---

  async destroy(): Promise<void> {
    this.logger.info('Destroying SlaveEmulator', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    // Остановка всех бесконечных задач
    this.clearInfinityTasks();

    // Отключение
    if (this.connected) {
      await this.disconnect();
    }

    // Очистка данных
    this.clearAllRegisters();
    this.clearExceptions();

    this.logger.info('SlaveEmulator destroyed', {
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  // --- Modbus RTU Frame handler ---

  handleRequest(buffer: Uint8Array): Uint8Array | null {
    try {
      if (!this.connected) {
        this.logger.warn('Received request but emulator not connected', {
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return null;
      }

      if (!(buffer instanceof Uint8Array)) {
        throw new Error('Input buffer must be Uint8Array or Buffer');
      }

      if (buffer.length < 5) {
        throw new Error('Invalid Modbus RTU frame: too short');
      }

      // Проверка CRC
      const crcReceived = (buffer[buffer.length - 2]! | (buffer[buffer.length - 1]! << 8)) & 0xffff; // Явно маскируем до 16 бит
      const dataForCrc = buffer.subarray(0, buffer.length - 2);
      const crcCalculatedBuffer = crc16Modbus(dataForCrc);
      if (crcCalculatedBuffer.length < 2) {
        throw new Error('crc16Modbus returned invalid buffer length');
      }
      const crcCalculated = (crcCalculatedBuffer[0]! << 8) | crcCalculatedBuffer[1]!;

      if (crcReceived !== crcCalculated) {
        this.logger.warn('CRC mismatch', {
          received: `0x${crcReceived.toString(16)}`,
          calculated: `0x${crcCalculated.toString(16)}`,
          frame: Buffer.from(buffer).toString('hex'), // Buffer.from может принимать Uint8Array
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return null;
      }

      const slaveAddr = buffer[0]!;
      if (slaveAddr !== this.slaveAddress && slaveAddr !== 0) {
        this.logger.debug('Frame ignored - wrong slave address', {
          targetSlave: slaveAddr,
          thisSlave: this.slaveAddress,
        } as LoggerContext);
        return null;
      }

      const functionCode = buffer[1]!;
      const data = buffer.subarray(2, buffer.length - 2);

      this.logger.info('Modbus request received', {
        slaveAddress: slaveAddr,
        functionCode: `0x${functionCode.toString(16)}`,
        data: Buffer.from(data).toString('hex'),
        dataLength: data.length,
      } as LoggerContext);

      return this._processFunctionCode(functionCode, data, slaveAddr);
    } catch (error: any) {
      this.logger.error('Error processing Modbus request', {
        error: error.message,
        stack: error.stack,
        slaveAddress: this.slaveAddress,
      } as LoggerContext);
      return this._createExceptionResponse(buffer?.[1] || 0x00, 0x04);
    }
  }

  private _processFunctionCode(
    functionCode: number,
    data: Uint8Array,
    slaveAddr: number
  ): Uint8Array {
    try {
      let responseData: Uint8Array;

      switch (functionCode) {
        case FUNCTION_CODES.READ_COILS:
          responseData = this._handleReadCoils(data);
          break;
        case FUNCTION_CODES.READ_DISCRETE_INPUTS:
          responseData = this._handleReadDiscreteInputs(data);
          break;
        case FUNCTION_CODES.READ_HOLDING_REGISTERS:
          responseData = this._handleReadHoldingRegisters(data);
          break;
        case FUNCTION_CODES.READ_INPUT_REGISTERS:
          responseData = this._handleReadInputRegisters(data);
          break;
        case FUNCTION_CODES.WRITE_SINGLE_COIL:
          responseData = this._handleWriteSingleCoil(data);
          break;
        case FUNCTION_CODES.WRITE_SINGLE_REGISTER:
          responseData = this._handleWriteSingleRegister(data);
          break;
        case FUNCTION_CODES.WRITE_MULTIPLE_COILS:
          responseData = this._handleWriteMultipleCoils(data);
          break;
        case FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS:
          responseData = this._handleWriteMultipleRegisters(data);
          break;
        default:
          this.logger.warn('Unsupported function code', {
            functionCode: `0x${functionCode.toString(16)}`,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
          throw new ModbusExceptionError(functionCode, 0x01);
      }

      return this._createSuccessResponse(slaveAddr, functionCode, responseData);
    } catch (error: any) {
      if (error instanceof ModbusExceptionError) {
        return this._createExceptionResponse(functionCode, error.exceptionCode);
      }
      throw error;
    }
  }

  // Специализированные методы обработки
  private _handleReadCoils(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Read Coils');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 2000);

    const coils = this.readCoils(startAddr, qty);
    const byteCount = Math.ceil(qty / 8);
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;

    for (let i = 0; i < qty; i++) {
      if (coils[i]) {
        resp[1 + Math.floor(i / 8)]! |= 1 << i % 8;
      }
    }

    return resp;
  }

  private _handleReadDiscreteInputs(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Read Discrete Inputs');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 2000);

    const inputs = this.readDiscreteInputs(startAddr, qty);
    const byteCount = Math.ceil(qty / 8);
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;

    for (let i = 0; i < qty; i++) {
      if (inputs[i]) {
        resp[1 + Math.floor(i / 8)]! |= 1 << i % 8;
      }
    }

    return resp;
  }

  private _handleReadHoldingRegisters(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Read Holding Registers');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 125);

    const registers = this.readHoldingRegisters(startAddr, qty);
    const byteCount = qty * 2;
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;

    for (let i = 0; i < qty; i++) {
      resp[1 + i * 2] = registers[i]! >> 8;
      resp[2 + i * 2] = registers[i]! & 0xff;
    }

    return resp;
  }

  private _handleReadInputRegisters(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Read Input Registers');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 125);

    const registers = this.readInputRegisters(startAddr, qty);
    const byteCount = qty * 2;
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;

    for (let i = 0; i < qty; i++) {
      resp[1 + i * 2] = registers[i]! >> 8;
      resp[2 + i * 2] = registers[i]! & 0xff;
    }

    return resp;
  }

  private _handleWriteSingleCoil(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Write Single Coil');
    }

    const addr = (data[0]! << 8) | data[1]!;
    const val = (data[2]! << 8) | data[3]!;

    if (val !== 0x0000 && val !== 0xff00) {
      throw new Error('Invalid coil value');
    }

    this._validateAddress(addr);
    this.writeSingleCoil(addr, val === 0xff00);

    return data;
  }

  private _handleWriteSingleRegister(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new Error('Invalid data length for Write Single Register');
    }

    const addr = (data[0]! << 8) | data[1]!;
    const val = (data[2]! << 8) | data[3]!;

    this._validateAddress(addr);
    this._validateValue(val, true);
    this.writeSingleRegister(addr, val);

    return data;
  }

  private _handleWriteMultipleCoils(data: Uint8Array): Uint8Array {
    if (data.length < 5) {
      throw new Error('Invalid data length for Write Multiple Coils');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;
    const byteCount = data[4];

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 1968);

    if (byteCount !== data.length - 5) {
      throw new Error('Byte count mismatch');
    }

    const coilValues: boolean[] = [];
    for (let i = 0; i < qty; i++) {
      const byteIndex = 5 + Math.floor(i / 8);
      const bitIndex = i % 8;
      coilValues.push((data[byteIndex]! & (1 << bitIndex)) !== 0);
    }

    this.writeMultipleCoils(startAddr, coilValues);

    return data.subarray(0, 4);
  }

  private _handleWriteMultipleRegisters(data: Uint8Array): Uint8Array {
    if (data.length < 5) {
      throw new Error('Invalid data length for Write Multiple Registers');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;
    const byteCount = data[4];

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 123);

    if (byteCount !== qty * 2) {
      throw new Error('Byte count mismatch');
    }

    const regValues: number[] = [];
    for (let i = 0; i < qty; i++) {
      regValues.push((data[5 + i * 2]! << 8) | data[6 + i * 2]!);
    }

    this.writeMultipleRegisters(startAddr, regValues);

    return data.subarray(0, 4);
  }

  private _createSuccessResponse(
    slaveAddr: number,
    functionCode: number,
    responseData: Uint8Array
  ): Uint8Array {
    const respBuf = new Uint8Array(2 + responseData.length + 2);
    respBuf[0] = slaveAddr;
    respBuf[1] = functionCode;
    respBuf.set(responseData, 2);

    const crc = crc16Modbus(respBuf.subarray(0, respBuf.length - 2));
    // crc16Modbus возвращает Uint8Array
    if (crc.length < 2) {
      throw new Error('crc16Modbus returned invalid buffer length');
    }
    const crcValue = (crc[0]! << 8) | crc[1]!;
    respBuf[respBuf.length - 2] = crcValue & 0xff;
    respBuf[respBuf.length - 1] = crcValue >> 8;

    this.logger.info('Modbus response created', {
      response: Buffer.from(respBuf).toString('hex'),
      length: respBuf.length,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    return respBuf;
  }

  private _createExceptionResponse(functionCode: number, exceptionCode: number): Uint8Array {
    const excBuf = new Uint8Array(5);
    excBuf[0] = this.slaveAddress;
    excBuf[1] = functionCode | 0x80;
    excBuf[2] = exceptionCode;

    const crc = crc16Modbus(excBuf.subarray(0, 3));
    // crc16Modbus возвращает Uint8Array
    if (crc.length < 2) {
      throw new Error('crc16Modbus returned invalid buffer length');
    }
    const crcValue = (crc[0]! << 8) | crc[1]!;
    excBuf[3] = crcValue & 0xff;
    excBuf[4] = crcValue >> 8;

    this.logger.warn('Exception response created', {
      response: Buffer.from(excBuf).toString('hex'),
      functionCode: `0x${functionCode.toString(16)}`,
      exceptionCode,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    return excBuf;
  }
}

export = SlaveEmulator;
