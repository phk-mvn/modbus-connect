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
import { ModbusFunctionCode, ModbusExceptionCode } from '../constants/constants.js';
import {
  ModbusExceptionError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
  ModbusIllegalDataValueError,
  ModbusIllegalDataAddressError,
  ModbusSlaveDeviceFailureError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTimeoutError,
  ModbusFlushError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusMemoryError,
  ModbusStackOverflowError,
  ModbusInvalidFunctionCodeError,
  ModbusSlaveBusyError,
  ModbusAcknowledgeError,
  ModbusMemoryParityError,
  ModbusGatewayPathUnavailableError,
  ModbusGatewayTargetDeviceError,
  ModbusGatewayBusyError,
  ModbusDataOverrunError,
  ModbusBroadcastError,
  ModbusConfigError,
  ModbusBaudRateError,
  ModbusSyncError,
  ModbusFrameBoundaryError,
  ModbusLRCError,
  ModbusChecksumError,
  ModbusParityError,
  ModbusNoiseError,
  ModbusFramingError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusTooManyEmptyReadsError,
  ModbusInterFrameTimeoutError,
  ModbusSilentIntervalError,
  ModbusInvalidStartingAddressError,
  ModbusMalformedFrameError,
  ModbusInvalidFrameLengthError,
  ModbusInvalidTransactionIdError,
  ModbusUnexpectedFunctionCodeError,
  ModbusConnectionRefusedError,
  ModbusConnectionTimeoutError,
  ModbusNotConnectedError,
  ModbusAlreadyConnectedError,
  ModbusInsufficientDataError,
} from '../errors.js';
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
    if (typeof slaveAddress !== 'number' || slaveAddress < 0 || slaveAddress > 247) {
      throw new ModbusInvalidAddressError(slaveAddress);
    }
    this.slaveAddress = slaveAddress;

    this.coils = new Map();
    this.discreteInputs = new Map();
    this.holdingRegisters = new Map();
    this.inputRegisters = new Map();
    this.exceptions = new Map();
    this._infinityTasks = new Map();

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

  private _validateAddress(address: number): void {
    if (typeof address !== 'number' || address < 0 || address > 0xffff) {
      throw new ModbusInvalidAddressError(address);
    }
  }

  private _validateQuantity(quantity: number, max: number = 125): void {
    if (typeof quantity !== 'number' || quantity <= 0 || quantity > max) {
      throw new ModbusInvalidQuantityError(quantity, 1, max);
    }
  }

  private _validateValue(value: unknown, isRegister: boolean = false): void {
    if (isRegister) {
      if (typeof value !== 'number') {
        throw new ModbusIllegalDataValueError(String(value), 'number between 0 and 65535');
      }
      if (value < 0 || value > 0xffff) {
        throw new ModbusIllegalDataValueError(value, 'between 0 and 65535');
      }
    } else {
      if (typeof value !== 'boolean') {
        throw new ModbusIllegalDataValueError(String(value), 'boolean');
      }
    }
  }

  infinityChange(params: InfinityChangeParams): void {
    const { typeRegister, register, range, interval } = params;

    if (
      !typeRegister ||
      typeof register !== 'number' ||
      !Array.isArray(range) ||
      range.length !== 2
    ) {
      throw new ModbusDataConversionError(params, 'valid InfinityChangeParams');
    }

    if (typeof interval !== 'number' || interval <= 0) {
      throw new ModbusDataConversionError(interval, 'positive number');
    }

    const key = `${typeRegister}:${register}`;

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
      throw new ModbusDataConversionError(typeRegister, 'valid register type');
    }

    if (min > max) {
      throw new ModbusDataConversionError(range, 'valid range (min <= max)');
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
        if (error instanceof ModbusExceptionError) {
          this.logger.error('Modbus exception in infinity change task', {
            error: error.message,
            functionCode: error.functionCode,
            exceptionCode: error.exceptionCode,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidAddressError) {
          this.logger.error('Invalid address in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidQuantityError) {
          this.logger.error('Invalid quantity in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusIllegalDataValueError) {
          this.logger.error('Illegal data value in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusIllegalDataAddressError) {
          this.logger.error('Illegal data address in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusSlaveDeviceFailureError) {
          this.logger.error('Slave device failure in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusCRCError) {
          this.logger.error('CRC error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusResponseError) {
          this.logger.error('Response error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusTimeoutError) {
          this.logger.error('Timeout error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusFlushError) {
          this.logger.error('Flush error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusDataConversionError) {
          this.logger.error('Data conversion error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusBufferOverflowError) {
          this.logger.error('Buffer overflow error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusBufferUnderrunError) {
          this.logger.error('Buffer underrun error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusMemoryError) {
          this.logger.error('Memory error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusStackOverflowError) {
          this.logger.error('Stack overflow error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidFunctionCodeError) {
          this.logger.error('Invalid function code error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusSlaveBusyError) {
          this.logger.error('Slave busy error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusAcknowledgeError) {
          this.logger.error('Acknowledge error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusMemoryParityError) {
          this.logger.error('Memory parity error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusGatewayPathUnavailableError) {
          this.logger.error('Gateway path unavailable error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusGatewayTargetDeviceError) {
          this.logger.error('Gateway target device error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusGatewayBusyError) {
          this.logger.error('Gateway busy error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusDataOverrunError) {
          this.logger.error('Data overrun error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusBroadcastError) {
          this.logger.error('Broadcast error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusConfigError) {
          this.logger.error('Config error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusBaudRateError) {
          this.logger.error('Baud rate error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusSyncError) {
          this.logger.error('Sync error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusFrameBoundaryError) {
          this.logger.error('Frame boundary error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusLRCError) {
          this.logger.error('LRC error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusChecksumError) {
          this.logger.error('Checksum error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusParityError) {
          this.logger.error('Parity error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusNoiseError) {
          this.logger.error('Noise error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusFramingError) {
          this.logger.error('Framing error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusOverrunError) {
          this.logger.error('Overrun error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusCollisionError) {
          this.logger.error('Collision error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusTooManyEmptyReadsError) {
          this.logger.error('Too many empty reads error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInterFrameTimeoutError) {
          this.logger.error('Inter-frame timeout error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusSilentIntervalError) {
          this.logger.error('Silent interval error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidStartingAddressError) {
          this.logger.error('Invalid starting address error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusMalformedFrameError) {
          this.logger.error('Malformed frame error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidFrameLengthError) {
          this.logger.error('Invalid frame length error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInvalidTransactionIdError) {
          this.logger.error('Invalid transaction ID error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusUnexpectedFunctionCodeError) {
          this.logger.error('Unexpected function code error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusConnectionRefusedError) {
          this.logger.error('Connection refused error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusConnectionTimeoutError) {
          this.logger.error('Connection timeout error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusNotConnectedError) {
          this.logger.error('Not connected error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusAlreadyConnectedError) {
          this.logger.error('Already connected error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else if (error instanceof ModbusInsufficientDataError) {
          this.logger.error('Insufficient data error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        } else {
          this.logger.error('Error in infinity change task', {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
        }
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
      throw new ModbusDataConversionError(definitions, 'valid RegisterDefinitions object');
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
      if (error instanceof ModbusExceptionError) {
        this.logger.error('Modbus exception adding registers', {
          error: error.message,
          functionCode: error.functionCode,
          exceptionCode: error.exceptionCode,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidAddressError) {
        this.logger.error('Invalid address adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidQuantityError) {
        this.logger.error('Invalid quantity adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusIllegalDataValueError) {
        this.logger.error('Illegal data value adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusIllegalDataAddressError) {
        this.logger.error('Illegal data address adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusSlaveDeviceFailureError) {
        this.logger.error('Slave device failure adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusCRCError) {
        this.logger.error('CRC error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusResponseError) {
        this.logger.error('Response error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusTimeoutError) {
        this.logger.error('Timeout error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusFlushError) {
        this.logger.error('Flush error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusDataConversionError) {
        this.logger.error('Data conversion error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusBufferOverflowError) {
        this.logger.error('Buffer overflow error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusBufferUnderrunError) {
        this.logger.error('Buffer underrun error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusMemoryError) {
        this.logger.error('Memory error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusStackOverflowError) {
        this.logger.error('Stack overflow error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidFunctionCodeError) {
        this.logger.error('Invalid function code error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusSlaveBusyError) {
        this.logger.error('Slave busy error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusAcknowledgeError) {
        this.logger.error('Acknowledge error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusMemoryParityError) {
        this.logger.error('Memory parity error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusGatewayPathUnavailableError) {
        this.logger.error('Gateway path unavailable error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusGatewayTargetDeviceError) {
        this.logger.error('Gateway target device error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusGatewayBusyError) {
        this.logger.error('Gateway busy error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusDataOverrunError) {
        this.logger.error('Data overrun error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusBroadcastError) {
        this.logger.error('Broadcast error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusConfigError) {
        this.logger.error('Config error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusBaudRateError) {
        this.logger.error('Baud rate error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusSyncError) {
        this.logger.error('Sync error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusFrameBoundaryError) {
        this.logger.error('Frame boundary error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusLRCError) {
        this.logger.error('LRC error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusChecksumError) {
        this.logger.error('Checksum error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusParityError) {
        this.logger.error('Parity error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusNoiseError) {
        this.logger.error('Noise error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusFramingError) {
        this.logger.error('Framing error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusOverrunError) {
        this.logger.error('Overrun error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusCollisionError) {
        this.logger.error('Collision error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusTooManyEmptyReadsError) {
        this.logger.error('Too many empty reads error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInterFrameTimeoutError) {
        this.logger.error('Inter-frame timeout error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusSilentIntervalError) {
        this.logger.error('Silent interval error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidStartingAddressError) {
        this.logger.error('Invalid starting address error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusMalformedFrameError) {
        this.logger.error('Malformed frame error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidFrameLengthError) {
        this.logger.error('Invalid frame length error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInvalidTransactionIdError) {
        this.logger.error('Invalid transaction ID error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusUnexpectedFunctionCodeError) {
        this.logger.error('Unexpected function code error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusConnectionRefusedError) {
        this.logger.error('Connection refused error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusConnectionTimeoutError) {
        this.logger.error('Connection timeout error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusNotConnectedError) {
        this.logger.error('Not connected error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusAlreadyConnectedError) {
        this.logger.error('Already connected error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else if (error instanceof ModbusInsufficientDataError) {
        this.logger.error('Insufficient data error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      } else {
        this.logger.error('Error adding registers', {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
      }
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
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    this.logger.info('readCoils', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_COILS, addr);
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

    this._checkException(ModbusFunctionCode.WRITE_SINGLE_COIL, address);
    this.setCoil(address, value);
    this.logger.info('writeSingleCoil', {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  writeMultipleCoils(startAddress: number, values: boolean[]): void {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 1968);

    if (!Array.isArray(values)) {
      throw new ModbusDataConversionError(values, 'array');
    }

    if (startAddress + values.length > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, values.length);
    }

    values.forEach((val, idx) => {
      this._validateValue(val, false);
      this._checkException(ModbusFunctionCode.WRITE_MULTIPLE_COILS, startAddress + idx);
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
    this._validateQuantity(quantity, 2000);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    this.logger.info('readDiscreteInputs', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_DISCRETE_INPUTS, addr);
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
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    this.logger.info('readHoldingRegisters', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
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

    this._checkException(ModbusFunctionCode.WRITE_SINGLE_REGISTER, address);
    this.setHoldingRegister(address, value);
    this.logger.info('writeSingleRegister', {
      address,
      value,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);
  }

  writeMultipleRegisters(startAddress: number, values: number[]): void {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 123);

    if (!Array.isArray(values)) {
      throw new ModbusDataConversionError(values, 'array');
    }

    if (startAddress + values.length > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, values.length);
    }

    values.forEach((val, idx) => {
      this._validateValue(val, true);
      this._checkException(ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, startAddress + idx);
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
    this._validateQuantity(quantity, 125);

    if (startAddress + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(startAddress, quantity);
    }

    this.logger.info('readInputRegisters', {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress,
    } as LoggerContext);

    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
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

    if (start + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(start, quantity);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
      result.push(this.getHoldingRegister(addr));
    }
    return result;
  }

  readInput(start: number, quantity: number): number[] {
    this._validateAddress(start);
    this._validateQuantity(quantity, 125);

    if (start + quantity > 0x10000) {
      throw new ModbusIllegalDataAddressError(start, quantity);
    }

    const result: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
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

    this.clearInfinityTasks();

    if (this.connected) {
      await this.disconnect();
    }

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
        throw new ModbusDataConversionError(buffer, 'Uint8Array');
      }

      if (buffer.length < 5) {
        throw new ModbusResponseError('Invalid Modbus RTU frame: too short');
      }

      const crcReceived = (buffer[buffer.length - 2]! | (buffer[buffer.length - 1]! << 8)) & 0xffff;
      const dataForCrc = buffer.subarray(0, buffer.length - 2);
      const crcCalculatedBuffer = crc16Modbus(dataForCrc);
      if (crcCalculatedBuffer.length < 2) {
        throw new ModbusCRCError('crc16Modbus returned invalid buffer length');
      }
      const crcCalculated = (crcCalculatedBuffer[0]! << 8) | crcCalculatedBuffer[1]!;

      if (crcReceived !== crcCalculated) {
        this.logger.warn('CRC mismatch', {
          received: `0x${crcReceived.toString(16)}`,
          calculated: `0x${crcCalculated.toString(16)}`,
          frame: Buffer.from(buffer).toString('hex'),
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        throw new ModbusCRCError('CRC mismatch detected');
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
      if (error instanceof ModbusExceptionError) {
        this.logger.error('Modbus exception processing request', {
          error: error.message,
          functionCode: error.functionCode,
          exceptionCode: error.exceptionCode,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(error.functionCode, error.exceptionCode);
      } else if (error instanceof ModbusInvalidAddressError) {
        this.logger.error('Invalid address processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof ModbusInvalidQuantityError) {
        this.logger.error('Invalid quantity processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_DATA_VALUE
        );
      } else if (error instanceof ModbusIllegalDataValueError) {
        this.logger.error('Illegal data value processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_DATA_VALUE
        );
      } else if (error instanceof ModbusIllegalDataAddressError) {
        this.logger.error('Illegal data address processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof ModbusSlaveDeviceFailureError) {
        this.logger.error('Slave device failure processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusCRCError) {
        this.logger.error('CRC error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusResponseError) {
        this.logger.error('Response error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusTimeoutError) {
        this.logger.error('Timeout error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusFlushError) {
        this.logger.error('Flush error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusDataConversionError) {
        this.logger.error('Data conversion error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusBufferOverflowError) {
        this.logger.error('Buffer overflow error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusBufferUnderrunError) {
        this.logger.error('Buffer underrun error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusMemoryError) {
        this.logger.error('Memory error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusStackOverflowError) {
        this.logger.error('Stack overflow error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInvalidFunctionCodeError) {
        this.logger.error('Invalid function code error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_FUNCTION
        );
      } else if (error instanceof ModbusSlaveBusyError) {
        this.logger.error('Slave busy error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_BUSY
        );
      } else if (error instanceof ModbusAcknowledgeError) {
        this.logger.error('Acknowledge error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(buffer?.[1] || 0x00, ModbusExceptionCode.ACKNOWLEDGE);
      } else if (error instanceof ModbusMemoryParityError) {
        this.logger.error('Memory parity error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.MEMORY_PARITY_ERROR
        );
      } else if (error instanceof ModbusGatewayPathUnavailableError) {
        this.logger.error('Gateway path unavailable error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE
        );
      } else if (error instanceof ModbusGatewayTargetDeviceError) {
        this.logger.error('Gateway target device error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED
        );
      } else if (error instanceof ModbusGatewayBusyError) {
        this.logger.error('Gateway busy error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED
        );
      } else if (error instanceof ModbusDataOverrunError) {
        this.logger.error('Data overrun error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusBroadcastError) {
        this.logger.error('Broadcast error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusConfigError) {
        this.logger.error('Config error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusBaudRateError) {
        this.logger.error('Baud rate error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusSyncError) {
        this.logger.error('Sync error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusFrameBoundaryError) {
        this.logger.error('Frame boundary error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusLRCError) {
        this.logger.error('LRC error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusChecksumError) {
        this.logger.error('Checksum error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusParityError) {
        this.logger.error('Parity error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusNoiseError) {
        this.logger.error('Noise error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusFramingError) {
        this.logger.error('Framing error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusOverrunError) {
        this.logger.error('Overrun error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusCollisionError) {
        this.logger.error('Collision error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusTooManyEmptyReadsError) {
        this.logger.error('Too many empty reads error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInterFrameTimeoutError) {
        this.logger.error('Inter-frame timeout error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusSilentIntervalError) {
        this.logger.error('Silent interval error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInvalidStartingAddressError) {
        this.logger.error('Invalid starting address error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof ModbusMalformedFrameError) {
        this.logger.error('Malformed frame error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInvalidFrameLengthError) {
        this.logger.error('Invalid frame length error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInvalidTransactionIdError) {
        this.logger.error('Invalid transaction ID error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusUnexpectedFunctionCodeError) {
        this.logger.error('Unexpected function code error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusConnectionRefusedError) {
        this.logger.error('Connection refused error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusConnectionTimeoutError) {
        this.logger.error('Connection timeout error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusNotConnectedError) {
        this.logger.error('Not connected error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusAlreadyConnectedError) {
        this.logger.error('Already connected error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof ModbusInsufficientDataError) {
        this.logger.error('Insufficient data error processing request', {
          error: error.message,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else {
        this.logger.error('Error processing Modbus request', {
          error: error.message,
          stack: error.stack,
          slaveAddress: this.slaveAddress,
        } as LoggerContext);
        return this._createExceptionResponse(
          buffer?.[1] || 0x00,
          ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      }
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
        case ModbusFunctionCode.READ_COILS:
          responseData = this._handleReadCoils(data);
          break;
        case ModbusFunctionCode.READ_DISCRETE_INPUTS:
          responseData = this._handleReadDiscreteInputs(data);
          break;
        case ModbusFunctionCode.READ_HOLDING_REGISTERS:
          responseData = this._handleReadHoldingRegisters(data);
          break;
        case ModbusFunctionCode.READ_INPUT_REGISTERS:
          responseData = this._handleReadInputRegisters(data);
          break;
        case ModbusFunctionCode.WRITE_SINGLE_COIL:
          responseData = this._handleWriteSingleCoil(data);
          break;
        case ModbusFunctionCode.WRITE_SINGLE_REGISTER:
          responseData = this._handleWriteSingleRegister(data);
          break;
        case ModbusFunctionCode.WRITE_MULTIPLE_COILS:
          responseData = this._handleWriteMultipleCoils(data);
          break;
        case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
          responseData = this._handleWriteMultipleRegisters(data);
          break;
        default:
          this.logger.warn('Unsupported function code', {
            functionCode: `0x${functionCode.toString(16)}`,
            slaveAddress: this.slaveAddress,
          } as LoggerContext);
          throw new ModbusExceptionError(functionCode, ModbusExceptionCode.ILLEGAL_FUNCTION);
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
      throw new ModbusResponseError('Invalid data length for Read Coils');
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
      throw new ModbusResponseError('Invalid data length for Read Discrete Inputs');
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
      throw new ModbusResponseError('Invalid data length for Read Holding Registers');
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
      throw new ModbusResponseError('Invalid data length for Read Input Registers');
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
      throw new ModbusResponseError('Invalid data length for Write Single Coil');
    }

    const addr = (data[0]! << 8) | data[1]!;
    const val = (data[2]! << 8) | data[3]!;

    if (val !== 0x0000 && val !== 0xff00) {
      throw new ModbusIllegalDataValueError(val, '0x0000 or 0xff00');
    }

    this._validateAddress(addr);
    this.writeSingleCoil(addr, val === 0xff00);

    return data;
  }

  private _handleWriteSingleRegister(data: Uint8Array): Uint8Array {
    if (data.length !== 4) {
      throw new ModbusResponseError('Invalid data length for Write Single Register');
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
      throw new ModbusResponseError('Invalid data length for Write Multiple Coils');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;
    const byteCount = data[4];

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 1968);

    if (byteCount !== data.length - 5) {
      throw new ModbusResponseError('Byte count mismatch');
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
      throw new ModbusResponseError('Invalid data length for Write Multiple Registers');
    }

    const startAddr = (data[0]! << 8) | data[1]!;
    const qty = (data[2]! << 8) | data[3]!;
    const byteCount = data[4];

    this._validateAddress(startAddr);
    this._validateQuantity(qty, 123);

    if (byteCount !== qty * 2) {
      throw new ModbusResponseError('Byte count mismatch');
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
      throw new ModbusCRCError('crc16Modbus returned invalid buffer length');
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
      throw new ModbusCRCError('crc16Modbus returned invalid buffer length');
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
