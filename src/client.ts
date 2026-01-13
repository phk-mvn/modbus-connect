// src/client.ts
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⢹⣿⣿⣿⣿⣿⣿⣿⣿⡧⠤⢼⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿
// ⣿⣿⣿⣿⢸⣿⣿⣿⣿⣿⣿⡿⠿⡗⠒⢺⣿⠿⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿
// ⣿⣿⣿⡇⢸⡏⢸⠙⡿⠛⠉⠄⠄⣋⣉⣉⣿⠄⣶⣍⡻⢿⠏⡇⢹⡇⢻⣿⣿⣿
// ⣿⣿⣿⡇⢸⡇⠈⡇⡇⠄⠄⠄⢠⠤⠤⠤⠿⡄⠸⣿⣿⣾⢰⠃⠘⣇⢸⣿⣿⣿
// ⣿⣿⣿⠃⢸⠁⠄⢧⢸⠄⠄⠄⢸⠤⠤⠤⢾⡇⠄⠹⣿⡏⢸⠄⠄⢻⠈⣿⣿⣿
// ⣿⣿⡿⠄⡏⠄⠄⢸⠘⡄⣀⠠⢞⠒⠒⠒⢺⣿⣄⡀⠈⡅⡏⠄⠄⢸⡄⢹⣿⣿
// ⣿⣿⡇⠄⡇⠄⢀⡠⠖⠋⠁⣰⣿⣷⣒⣒⣺⣿⣿⣿⣷⣦⣇⠄⠄⠘⡇⠸⣿⣿
// ⣿⣿⡡⢴⠃⢾⠓⠒⠢⠤⠼⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠛⠲⠄⡷⢄⣿⣿⣿
// ⣿⡏⠁⢸⠄⠈⣿⣿⠉⠓⣶⣶⡖⠒⠒⠒⠒⢒⣶⣶⡒⠛⢹⣿ ⠁⠄⡇⠄⣿
// ⣿⡇⠄⢸⠄⠄⠻⡛⢄⣠⣤⣤⣥⡔⡏⣉⡟⣦⣭⣭⣅⠄⠘⡻⠄⠄⣿⠄⠄⣿
// ⣿⡇⠄⢸⠄⠄⠄⠙⢄⣙⣿⡿⠿⠛⠉⡟⠁⠛⠿⣿⣏⣁⠞⠁⠄⠄⢻⠄⠄⣿
// ⣿⡇⠄⢸⠄⠄⠄⠄⢸⣿⡇⠄⠄⠄⠄⡇⠄⠄⠄⠄⣿⣿⠄⠄⠄⠄⢸⠄⠄⣿
// ⣿⡇⠄⣸⠄⠄⠄⠄⢸⣿⡇⠄⠄⠄⠄⡇⠄⠄⠄⠄⣿⣿⠄⠄⠄⠄⢸⠄⠄⣿
// ⣿⣿⣦⣿⠄⠄⠄⠄⢸⣿⡇⠄⠄⠄⠄⡇⠄⠄⠄⠄⣿⣿⠄⠄⠄⠄⢸⣤⣾⣿
// ⣿⣿⣿⣿⠄⠄⣠⠴⢊⣽⠃⠄⠄⠄⠄⡇⠄⠄⠄⠄⢩⡉⠲⢄⡀⠄⣸⣿⣿⣿
// ⣿⣿⣿⣿⣷⣮⣁⣠⣿⣿⣿⣶⣦⣀⡀⡇⢀⣠⣶⣿⣿⣿⣦⣀⣽⣾⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
import { Mutex } from 'async-mutex';
// Registers
import {
  buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse,
} from './function-codes/read-holding-registers.js';
import {
  buildReadInputRegistersRequest,
  parseReadInputRegistersResponse,
} from './function-codes/read-input-registers.js';
import {
  buildWriteSingleRegisterRequest,
  parseWriteSingleRegisterResponse,
} from './function-codes/write-single-register.js';
import {
  buildWriteMultipleRegistersRequest,
  parseWriteMultipleRegistersResponse,
} from './function-codes/write-multiple-registers.js';
// Bit operations
import { buildReadCoilsRequest, parseReadCoilsResponse } from './function-codes/read-coils.js';
import {
  buildReadDiscreteInputsRequest,
  parseReadDiscreteInputsResponse,
} from './function-codes/read-discrete-inputs.js';
import {
  buildWriteSingleCoilRequest,
  parseWriteSingleCoilResponse,
} from './function-codes/write-single-coil.js';
import {
  buildWriteMultipleCoilsRequest,
  parseWriteMultipleCoilsResponse,
} from './function-codes/write-multiple-coils.js';
// Special functions
import {
  buildReportSlaveIdRequest,
  parseReportSlaveIdResponse,
} from './function-codes/report-slave-id.js';
import {
  buildReadDeviceIdentificationRequest,
  parseReadDeviceIdentificationResponse,
} from './function-codes/read-device-identification.js';
import {
  ModbusTimeoutError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
  ModbusIllegalDataValueError,
  ModbusNotConnectedError,
  ModbusDataConversionError,
} from './errors.js';
import { ModbusFunctionCode, ModbusExceptionCode, RegisterType } from './constants/constants.js';

import Logger from './logger.js';
import {
  crc16Modbus,
  crc16CcittFalse,
  crc32,
  crc8,
  crc1,
  crc8_1wire,
  crc8_dvbs2,
  crc16_kermit,
  crc16_xmodem,
  crc24,
  crc32mpeg,
  crcjam,
} from './utils/crc.js';
import {
  Transport,
  ModbusClientOptions,
  ConvertRegisterOptions,
  LogContext as LoggerContext,
  ConvertedRegisters,
  ReadCoilsResponse,
  ReadDiscreteInputsResponse,
  WriteSingleCoilResponse,
  WriteMultipleCoilsResponse,
  WriteSingleRegisterResponse,
  WriteMultipleRegistersResponse,
  ReportSlaveIdResponse,
  ReadDeviceIdentificationResponse,
  TransportControllerInterface,
  RSMode,
  IModbusPlugin,
  CustomFunctionHandler,
} from './types/modbus-types.js';

// Protocol Layer
import { ModbusProtocol } from './framers/modbus-protocol.js';
import { RtuFramer } from './framers/rtu-framer.js';
import { TcpFramer } from './framers/tcp-framer.js';

// Type for CRC function
type CrcFunction = (data: Uint8Array) => Uint8Array;

// Map of explicitly typed CRC algorithms
const crcAlgorithmMap: Record<string, CrcFunction> = {
  crc16Modbus,
  crc16CcittFalse,
  crc32,
  crc8,
  crc1,
  crc8_1wire,
  crc8_dvbs2,
  crc16_kermit,
  crc16_xmodem,
  crc24,
  crc32mpeg,
  crcjam,
};

const logger = new Logger();
logger.setLevel('error');

type DataViewMethod32 = 'getUint32' | 'getInt32' | 'getFloat32';
type DataViewMethod64 = 'getUint64' | 'getInt64' | 'getFloat64';
type SwapMode = 'sw' | 'sb' | 'sbw' | 'le' | 'le_sw' | 'le_sb' | 'le_sbw';

class ModbusClient {
  private transportController: TransportControllerInterface;
  private slaveId: number;
  private options: ModbusClientOptions;
  private rsMode: RSMode;
  private defaultTimeout: number;
  private retryCount: number;
  private retryDelay: number;
  private _mutex: Mutex;

  private _plugins: IModbusPlugin[] = [];
  private _customFunctions: Map<string, CustomFunctionHandler> = new Map();
  private _customRegisterTypes: Map<string, (registers: number[]) => any[]> = new Map();
  private _customCrcAlgorithms: Map<string, CrcFunction> = new Map();

  private static readonly FUNCTION_CODE_MAP = new Map<number, ModbusFunctionCode>([
    [0x01, ModbusFunctionCode.READ_COILS],
    [0x02, ModbusFunctionCode.READ_DISCRETE_INPUTS],
    [0x03, ModbusFunctionCode.READ_HOLDING_REGISTERS],
    [0x04, ModbusFunctionCode.READ_INPUT_REGISTERS],
    [0x05, ModbusFunctionCode.WRITE_SINGLE_COIL],
    [0x06, ModbusFunctionCode.WRITE_SINGLE_REGISTER],
    [0x0f, ModbusFunctionCode.WRITE_MULTIPLE_COILS],
    [0x10, ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS],
    [0x11, ModbusFunctionCode.REPORT_SLAVE_ID],
    [0x14, ModbusFunctionCode.READ_DEVICE_COMMENT],
    [0x15, ModbusFunctionCode.WRITE_DEVICE_COMMENT],
    [0x2b, ModbusFunctionCode.READ_DEVICE_IDENTIFICATION],
    [0x52, ModbusFunctionCode.READ_FILE_LENGTH],
    [0x5a, ModbusFunctionCode.READ_FILE_CHUNK],
    [0x55, ModbusFunctionCode.OPEN_FILE],
    [0x57, ModbusFunctionCode.CLOSE_FILE],
    [0x5c, ModbusFunctionCode.RESTART_CONTROLLER],
    [0x6e, ModbusFunctionCode.GET_CONTROLLER_TIME],
    [0x6f, ModbusFunctionCode.SET_CONTROLLER_TIME],
  ]);

  private static readonly EXCEPTION_CODE_MAP = new Map<number, ModbusExceptionCode>([
    [1, ModbusExceptionCode.ILLEGAL_FUNCTION],
    [2, ModbusExceptionCode.ILLEGAL_DATA_ADDRESS],
    [3, ModbusExceptionCode.ILLEGAL_DATA_VALUE],
    [4, ModbusExceptionCode.SLAVE_DEVICE_FAILURE],
    [5, ModbusExceptionCode.ACKNOWLEDGE],
    [6, ModbusExceptionCode.SLAVE_DEVICE_BUSY],
    [8, ModbusExceptionCode.MEMORY_PARITY_ERROR],
    [10, ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE],
    [11, ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED],
  ]);

  constructor(
    transportController: TransportControllerInterface,
    slaveId: number = 1,
    options: ModbusClientOptions = {}
  ) {
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 255) {
      throw new ModbusInvalidAddressError(slaveId);
    }

    this.transportController = transportController;
    this.slaveId = slaveId;
    this.options = options;
    this.rsMode = options.RSMode ?? 'RS485';
    this.defaultTimeout = options.timeout ?? 2000;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;

    this._mutex = new Mutex();
    this._setAutoLoggerContext();

    if (options.plugins && Array.isArray(options.plugins)) {
      for (const PluginClass of options.plugins) {
        this.use(new PluginClass());
      }
    }
  }

  /**
   * Returns the effective transport for the client
   */
  private get _effectiveTransport(): Transport | null {
    return this.transportController.getTransportForSlave(this.slaveId, this.rsMode);
  }

  /**
   * Enables the ModbusClient logger
   * @param level - Logging level
   */
  enableLogger(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
    logger.setLevel(level);
  }

  /**
   * Disables the ModbusClient logger (sets the highest level - error)
   */
  disableLogger(): void {
    logger.setLevel('error');
  }

  /**
   * Sets the context for the logger (slaveId, functionCode, etc.)
   * @param context - Context for the logger
   */
  setLoggerContext(context: LoggerContext): void {
    logger.addGlobalContext(context);
  }

  /**
   * Sets the logger context automatically based on the current settings.
   */
  private _setAutoLoggerContext(funcCode?: number): void {
    const transport = this._effectiveTransport;
    const transportName = transport ? transport.constructor.name : 'Unknown';
    const context: LoggerContext = {
      slaveId: this.slaveId,
      transport: transportName,
    };
    if (funcCode !== undefined) {
      context.funcCode = funcCode;
    }
    logger.addGlobalContext(context);
  }

  /**
   * Registers a plugin with the ModbusClient.
   * @param plugin - The plugin to register.
   */
  public use(plugin: IModbusPlugin): void {
    if (!plugin || typeof plugin.name !== 'string') {
      throw new Error(
        'Invalid plugin provided. A plugin must be an object with a "name" property.'
      );
    }

    if (this._plugins.some(p => p.name === plugin.name)) {
      logger.warn(`Plugin with name "${plugin.name}" is already registered. Skipping.`);
      return;
    }

    this._plugins.push(plugin);

    if (plugin.customFunctionCodes) {
      for (const funcName in plugin.customFunctionCodes) {
        if (this._customFunctions.has(funcName)) {
          logger.warn(
            `Custom function "${funcName}" from plugin "${plugin.name}" overrides an existing function.`
          );
        }
        const handler = plugin.customFunctionCodes[funcName];
        if (handler) {
          this._customFunctions.set(funcName, handler);
        }
      }
    }

    if (plugin.customRegisterTypes) {
      for (const typeName in plugin.customRegisterTypes) {
        const isBuiltIn = Object.values(RegisterType).includes(typeName as RegisterType);
        if (this._customRegisterTypes.has(typeName) || isBuiltIn) {
          logger.warn(
            `Custom register type "${typeName}" from plugin "${plugin.name}" overrides an existing type.`
          );
        }
        const handler = plugin.customRegisterTypes[typeName];
        if (handler) {
          this._customRegisterTypes.set(typeName, handler);
        }
      }
    }

    if (plugin.customCrcAlgorithms) {
      for (const algoName in plugin.customCrcAlgorithms) {
        if (this._customCrcAlgorithms.has(algoName) || crcAlgorithmMap[algoName]) {
          logger.warn(
            `Custom CRC algorithm "${algoName}" from plugin "${plugin.name}" overrides an existing algorithm.`
          );
        }
        const handler = plugin.customCrcAlgorithms[algoName];
        if (handler) {
          this._customCrcAlgorithms.set(algoName, handler);
        }
      }
    }

    logger.info(`Plugin "${plugin.name}" registered successfully.`);
  }

  /**
   * Executes a custom function registered by a plugin.
   * @param functionName - The name of the custom function to execute.
   * @param args - Arguments to pass to the custom function.
   * @returns The result of the custom function.
   */
  public async executeCustomFunction(functionName: string, ...args: any[]): Promise<any> {
    const handler = this._customFunctions.get(functionName);
    if (!handler) {
      throw new Error(
        `Custom function "${functionName}" is not registered. Have you registered the plugin using client.use()?`
      );
    }

    const requestPdu = handler.buildRequest(...args);

    const responsePdu = await this._sendRequest(requestPdu);
    if (!responsePdu) {
      return handler.parseResponse(new Uint8Array(0));
    }

    return handler.parseResponse(responsePdu);
  }

  /**
   * Performs a logical connection check to ensure the client is ready for communication.
   * This method verifies that a transport is available and has been connected by the TransportController.
   * It does NOT initiate the physical connection itself.
   * Throws ModbusNotConnectedError if the transport is not ready.
   */
  public async connect(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      const transport = this._effectiveTransport;

      if (!transport) {
        throw new ModbusNotConnectedError();
      }

      if (!transport.isOpen) {
        throw new ModbusNotConnectedError();
      }

      this._setAutoLoggerContext();
      logger.info('Client is ready. Transport is connected and available.', {
        slaveId: this.slaveId,
        transport: transport.constructor.name,
      });
    } finally {
      release();
    }
  }

  /**
   * Performs a logical disconnection for the client.
   * This method is a no-op regarding the physical transport layer, which should be managed
   * exclusively by the TransportController. It simply logs the client's logical disconnection.
   */
  public async disconnect(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      const transport = this._effectiveTransport;
      this._setAutoLoggerContext();
      logger.info(
        'Client logically disconnected. The physical transport connection is not affected.',
        {
          slaveId: this.slaveId,
          transport: transport ? transport.constructor.name : 'N/A',
        }
      );
    } finally {
      release();
    }
  }

  /**
   * Sends a request to the Modbus transport.
   * @param pdu - The PDU of the request packet.
   * @param timeout - The timeout in milliseconds.
   * @param ignoreNoResponse - Whether to ignore no response.
   * @returns The received packet or undefined if no response is expected.
   * @throws ModbusTimeoutError If the send operation times out.
   */
  private async _sendRequest(
    pdu: Uint8Array,
    timeout: number = this.defaultTimeout,
    ignoreNoResponse: boolean = false
  ): Promise<Uint8Array | undefined> {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0];
      const funcCodeEnum = ModbusClient.FUNCTION_CODE_MAP.get(funcCode!) ?? funcCode;
      const slaveId = this.slaveId;
      const startTime = Date.now();
      let lastError: unknown;

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        const transport = this._effectiveTransport;
        if (!transport) throw new ModbusNotConnectedError();

        // Инициализируем фреймер на основе опций
        const framer =
          this.options.framing === 'tcp'
            ? new TcpFramer()
            : new RtuFramer(crcAlgorithmMap[this.options.crcAlgorithm ?? 'crc16Modbus']);

        const protocol = new ModbusProtocol(transport, framer);
        this._setAutoLoggerContext(funcCodeEnum);

        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new ModbusTimeoutError('Timeout before request');

          logger.debug(`Attempt #${attempt + 1} — exchange start`, { slaveId, funcCode });

          if (ignoreNoResponse) {
            // Если ответ не нужен, просто отправляем ADU
            await transport.write(framer.buildAdu(slaveId, pdu));
            return undefined;
          }

          // Выполняем цикл запрос-ответ через слой протокола
          const responsePdu = await protocol.exchange(slaveId, pdu, timeLeft);

          // Проверка на Modbus Exception (код функции | 0x80)
          if ((responsePdu[0]! & 0x80) !== 0) {
            const excCode = responsePdu[1]!;
            const modbusExc = ModbusClient.EXCEPTION_CODE_MAP.get(excCode) ?? excCode;
            throw new ModbusExceptionError(responsePdu[0]! & 0x7f, modbusExc as number);
          }

          logger.info('Response received', {
            slaveId,
            funcCode,
            responseTime: Date.now() - startTime,
          });

          return responsePdu;
        } catch (err: unknown) {
          lastError = err;
          const elapsed = Date.now() - startTime;

          logger.warn(
            `Attempt #${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
            { slaveId, funcCode, responseTime: elapsed }
          );

          if (attempt < this.retryCount) {
            const delay = err instanceof ModbusFlushError ? 50 : this.retryDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
      release();
    }
  }

  /**
   * Converts Modbus registers to the specified type.
   * @param registers - The registers to convert.
   * @param type - The type of the registers.
   * @returns The converted registers.
   */
  private _convertRegisters<T extends RegisterType>(
    registers: number[],
    type: T = RegisterType.UINT16 as T
  ): any {
    if (!registers || !Array.isArray(registers)) {
      throw new ModbusDataConversionError(registers, 'non-empty array');
    }

    const customTypeHandler = this._customRegisterTypes.get(type as string);
    if (customTypeHandler) {
      return customTypeHandler(registers);
    }

    const buffer = new ArrayBuffer(registers.length * 2);
    const view = new DataView(buffer);
    registers.forEach((reg, i) => {
      view.setUint16(i * 2, reg, false);
    });

    const read32 = (method: DataViewMethod32, littleEndian: boolean = false): number[] => {
      const result: number[] = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        result.push(view[method](i * 2, littleEndian));
      }
      return result;
    };

    const read64 = (
      method: DataViewMethod64,
      littleEndian: boolean = false
    ): bigint[] | number[] => {
      if (method === 'getFloat64') {
        const result: number[] = [];
        for (let i = 0; i < registers.length - 3; i += 4) {
          const tempBuf = new ArrayBuffer(8);
          const tempView = new DataView(tempBuf);
          for (let j = 0; j < 8; j++) {
            tempView.setUint8(j, view.getUint8(i * 2 + j));
          }
          result.push(tempView.getFloat64(0, littleEndian));
        }
        return result;
      }
      const result: bigint[] = [];
      for (let i = 0; i < registers.length - 3; i += 4) {
        const tempBuf = new ArrayBuffer(8);
        const tempView = new DataView(tempBuf);
        for (let j = 0; j < 8; j++) {
          tempView.setUint8(j, view.getUint8(i * 2 + j));
        }
        const high = BigInt(tempView.getUint32(0, littleEndian));
        const low = BigInt(tempView.getUint32(4, littleEndian));
        let value = (high << 32n) | low;
        if (method === 'getInt64' && value & (1n << 63n)) {
          value -= 1n << 64n;
        }
        result.push(value);
      }
      return result;
    };

    const getSwapped32 = (i: number, mode: SwapMode): DataView => {
      const a = view.getUint8(i * 2);
      const b = view.getUint8(i * 2 + 1);
      const c = view.getUint8(i * 2 + 2);
      const d = view.getUint8(i * 2 + 3);
      let bytes: number[];
      switch (mode) {
        case 'sw':
          bytes = [c, d, a, b];
          break;
        case 'sb':
          bytes = [b, a, d, c];
          break;
        case 'sbw':
          bytes = [d, c, b, a];
          break;
        case 'le':
          bytes = [d, c, b, a];
          break;
        case 'le_sw':
          bytes = [b, a, d, c];
          break;
        case 'le_sb':
          bytes = [a, b, c, d];
          break;
        case 'le_sbw':
          bytes = [c, d, a, b];
          break;
        default:
          bytes = [a, b, c, d];
          break;
      }
      const tempBuf = new ArrayBuffer(4);
      const tempView = new DataView(tempBuf);
      bytes.forEach((byte, idx) => tempView.setUint8(idx, byte));
      return tempView;
    };

    const read32Swapped = (method: DataViewMethod32, mode: SwapMode): number[] => {
      const result: number[] = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        const tempView = getSwapped32(i, mode);
        result.push(tempView[method](0, false));
      }
      return result;
    };

    switch (type) {
      case RegisterType.UINT16:
        return registers as ConvertedRegisters<T>;
      case RegisterType.INT16:
        return registers.map((_, i) => view.getInt16(i * 2, false)) as ConvertedRegisters<T>;
      case RegisterType.UINT32:
        return read32('getUint32') as ConvertedRegisters<T>;
      case RegisterType.INT32:
        return read32('getInt32') as ConvertedRegisters<T>;
      case RegisterType.FLOAT:
        return read32('getFloat32') as ConvertedRegisters<T>;
      case RegisterType.UINT32_LE:
        return read32('getUint32', true) as ConvertedRegisters<T>;
      case RegisterType.INT32_LE:
        return read32('getInt32', true) as ConvertedRegisters<T>;
      case RegisterType.FLOAT_LE:
        return read32('getFloat32', true) as ConvertedRegisters<T>;
      case RegisterType.UINT32_SW:
        return read32Swapped('getUint32', 'sw') as ConvertedRegisters<T>;
      case RegisterType.INT32_SW:
        return read32Swapped('getInt32', 'sw') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_SW:
        return read32Swapped('getFloat32', 'sw') as ConvertedRegisters<T>;
      case RegisterType.UINT32_SB:
        return read32Swapped('getUint32', 'sb') as ConvertedRegisters<T>;
      case RegisterType.INT32_SB:
        return read32Swapped('getInt32', 'sb') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_SB:
        return read32Swapped('getFloat32', 'sb') as ConvertedRegisters<T>;
      case RegisterType.UINT32_SBW:
        return read32Swapped('getUint32', 'sbw') as ConvertedRegisters<T>;
      case RegisterType.INT32_SBW:
        return read32Swapped('getInt32', 'sbw') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_SBW:
        return read32Swapped('getFloat32', 'sbw') as ConvertedRegisters<T>;
      case RegisterType.UINT32_LE_SW:
        return read32Swapped('getUint32', 'le_sw') as ConvertedRegisters<T>;
      case RegisterType.INT32_LE_SW:
        return read32Swapped('getInt32', 'le_sw') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_LE_SW:
        return read32Swapped('getFloat32', 'le_sw') as ConvertedRegisters<T>;
      case RegisterType.UINT32_LE_SB:
        return read32Swapped('getUint32', 'le_sb') as ConvertedRegisters<T>;
      case RegisterType.INT32_LE_SB:
        return read32Swapped('getInt32', 'le_sb') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_LE_SB:
        return read32Swapped('getFloat32', 'le_sb') as ConvertedRegisters<T>;
      case RegisterType.UINT32_LE_SBW:
        return read32Swapped('getUint32', 'le_sbw') as ConvertedRegisters<T>;
      case RegisterType.INT32_LE_SBW:
        return read32Swapped('getInt32', 'le_sbw') as ConvertedRegisters<T>;
      case RegisterType.FLOAT_LE_SBW:
        return read32Swapped('getFloat32', 'le_sbw') as ConvertedRegisters<T>;
      case RegisterType.UINT64:
        return read64('getUint64') as ConvertedRegisters<T>;
      case RegisterType.INT64:
        return read64('getInt64') as ConvertedRegisters<T>;
      case RegisterType.DOUBLE:
        return read64('getFloat64') as ConvertedRegisters<T>;
      case RegisterType.UINT64_LE:
        return read64('getUint64', true) as ConvertedRegisters<T>;
      case RegisterType.INT64_LE:
        return read64('getInt64', true) as ConvertedRegisters<T>;
      case RegisterType.DOUBLE_LE:
        return read64('getFloat64', true) as ConvertedRegisters<T>;
      case RegisterType.HEX:
        return registers.map(r =>
          r.toString(16).toUpperCase().padStart(4, '0')
        ) as ConvertedRegisters<T>;
      case RegisterType.STRING: {
        let str = '';
        for (let i = 0; i < registers.length; i++) {
          const high = (registers[i]! >> 8) & 0xff;
          const low = registers[i]! & 0xff;
          if (high !== 0) str += String.fromCharCode(high);
          if (low !== 0) str += String.fromCharCode(low);
        }
        return [str] as ConvertedRegisters<T>;
      }
      case RegisterType.BOOL:
        return registers.map(r => r !== 0) as ConvertedRegisters<T>;
      case RegisterType.BINARY:
        return registers.map(r =>
          r
            .toString(2)
            .padStart(16, '0')
            .split('')
            .map(b => b === '1')
        ) as ConvertedRegisters<T>;
      case RegisterType.BCD:
        return registers.map(r => {
          const high = (r >> 8) & 0xff;
          const low = r & 0xff;
          return ((high >> 4) * 10 + (high & 0x0f)) * 100 + (low >> 4) * 10 + (low & 0x0f);
        }) as ConvertedRegisters<T>;
      default:
        throw new ModbusDataConversionError(type, 'a supported built-in or custom register type');
    }
  }

  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - Optional options for the conversion.
   * @returns The converted registers.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  public async readHoldingRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<any> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }
    const pdu = buildReadHoldingRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    const registers = parseReadHoldingRegistersResponse(responsePdu);
    const type = options.type ?? RegisterType.UINT16;
    return this._convertRegisters(registers, type) as ConvertedRegisters<T>;
  }

  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - Optional options for the conversion.
   * @returns The converted registers.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  public async readInputRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<any> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }
    const pdu = buildReadInputRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    const registers = parseReadInputRegistersResponse(responsePdu);
    const type = options.type ?? RegisterType.UINT16;
    return this._convertRegisters(registers, type) as ConvertedRegisters<T>;
  }

  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write.
   * @param value - The value to write to the register.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the address is invalid.
   * @throws ModbusIllegalDataValueError If the value is invalid.
   */
  public async writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<WriteSingleRegisterResponse> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new ModbusIllegalDataValueError(value, 'integer between 0 and 65535');
    }
    const pdu = buildWriteSingleRegisterRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseWriteSingleRegisterResponse(responsePdu);
  }

  /**
   * Writes multiple registers to the Modbus device.
   * @param startAddress - The starting address of the registers to write.
   * @param values - The values to write to the registers.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   * @throws ModbusIllegalDataValueError If any of the values are invalid.
   */
  public async writeMultipleRegisters(
    startAddress: number,
    values: number[],
    timeout?: number
  ): Promise<WriteMultipleRegistersResponse> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 123) {
      throw new ModbusInvalidQuantityError(values.length, 1, 123);
    }
    if (values.some(v => !Number.isInteger(v) || v < 0 || v > 65535)) {
      const invalidValue = values.find(v => !Number.isInteger(v) || v < 0 || v > 65535);
      throw new ModbusIllegalDataValueError(invalidValue!, 'integer between 0 and 65535');
    }
    const pdu = buildWriteMultipleRegistersRequest(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseWriteMultipleRegistersResponse(responsePdu);
  }

  /**
   * Reads coils from the Modbus device.
   * @param startAddress - The starting address of the coils to read.
   * @param quantity - The number of coils to read.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  public async readCoils(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadCoilsResponse> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
      throw new ModbusInvalidQuantityError(quantity, 1, 2000);
    }
    const pdu = buildReadCoilsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReadCoilsResponse(responsePdu);
  }

  /**
   * Reads discrete inputs from the Modbus device.
   * @param startAddress - The starting address of the discrete inputs to read.
   * @param quantity - The number of discrete inputs to read.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  public async readDiscreteInputs(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadDiscreteInputsResponse> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
      throw new ModbusInvalidQuantityError(quantity, 1, 2000);
    }
    const pdu = buildReadDiscreteInputsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReadDiscreteInputsResponse(responsePdu);
  }

  /**
   * Writes a single coil to the Modbus device.
   * @param address - The address of the coil to write.
   * @param value - The value to write to the coil (boolean or 0/1).
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the address is invalid.
   * @throws ModbusIllegalDataValueError If the value is invalid.
   */
  public async writeSingleCoil(
    address: number,
    value: boolean | number,
    timeout?: number
  ): Promise<WriteSingleCoilResponse> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (typeof value === 'number' && value !== 0 && value !== 1) {
      throw new ModbusIllegalDataValueError(value, 'boolean or 0/1');
    }
    const pdu = buildWriteSingleCoilRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseWriteSingleCoilResponse(responsePdu);
  }

  /**
   * Writes multiple coils to the Modbus device.
   * @param startAddress - The starting address of the coils to write.
   * @param values - The values to write to the coils (array of booleans or 0/1).
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   * @throws ModbusIllegalDataValueError If any of the values are invalid.
   */
  public async writeMultipleCoils(
    startAddress: number,
    values: boolean[],
    timeout?: number
  ): Promise<WriteMultipleCoilsResponse> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 1968) {
      throw new ModbusInvalidQuantityError(values.length, 1, 1968);
    }
    const pdu = buildWriteMultipleCoilsRequest(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseWriteMultipleCoilsResponse(responsePdu);
  }

  /**
   * Reports the slave ID of the Modbus device.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   */
  public async reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse> {
    const pdu = buildReportSlaveIdRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReportSlaveIdResponse(responsePdu);
  }

  /**
   * Reads device identification from the Modbus device.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   */
  public async readDeviceIdentification(
    timeout?: number
  ): Promise<ReadDeviceIdentificationResponse> {
    const originalSlaveId = this.slaveId;
    try {
      const pdu = buildReadDeviceIdentificationRequest();
      const responsePdu = await this._sendRequest(pdu, timeout);
      if (!responsePdu) {
        throw new Error('No response received');
      }
      return parseReadDeviceIdentificationResponse(responsePdu);
    } finally {
      this.slaveId = originalSlaveId;
    }
  }
}

export = ModbusClient;
