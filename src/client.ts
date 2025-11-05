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
// Special functions for SGM130
import {
  buildReadFileLengthRequest,
  parseReadFileLengthResponse,
} from './function-codes/SGM130/read-file-length.js';
import { buildOpenFileRequest, parseOpenFileResponse } from './function-codes/SGM130/openFile.js';
import {
  buildCloseFileRequest,
  parseCloseFileResponse,
} from './function-codes/SGM130/closeFile.js';
import {
  buildRestartControllerRequest,
  parseRestartControllerResponse,
} from './function-codes/SGM130/restart-controller.js';
import {
  buildGetControllerTimeRequest,
  parseGetControllerTimeResponse,
} from './function-codes/SGM130/get-controller-time.js';
import {
  buildSetControllerTimeRequest,
  parseSetControllerTimeResponse,
} from './function-codes/SGM130/set-controller-time.js';
import {
  ModbusTimeoutError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusCRCError,
  ModbusFramingError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusConfigError,
  ModbusSyncError,
  ModbusFrameBoundaryError,
  ModbusLRCError,
  ModbusChecksumError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusMemoryError,
  ModbusStackOverflowError,
  ModbusResponseError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
  ModbusIllegalDataValueError,
  ModbusMalformedFrameError,
  ModbusInvalidFrameLengthError,
  ModbusInvalidTransactionIdError,
  ModbusUnexpectedFunctionCodeError,
  ModbusNotConnectedError,
  ModbusInsufficientDataError,
  ModbusTooManyEmptyReadsError,
  ModbusInterFrameTimeoutError,
  ModbusSilentIntervalError,
  ModbusParityError,
  ModbusNoiseError,
} from './errors.js';
import {
  ModbusFunctionCode,
  ModbusExceptionCode,
  MODBUS_EXCEPTION_MESSAGES,
  RegisterType,
} from './constants/constants.js';
import { buildPacket, parsePacket } from './packet-builder.js';
import Logger from './logger.js';
import { Diagnostics } from './utils/diagnostics.js';
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
  ControllerTime,
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
  ReadFileLengthResponse,
  OpenFileResponse,
  CloseFileResponse,
  RestartControllerResponse,
  GetControllerTimeResponse,
  SetControllerTimeResponse,
  TransportControllerInterface,
  ConnectionErrorType,
} from './types/modbus-types.js';

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
  private defaultTimeout: number;
  private retryCount: number;
  private retryDelay: number;
  private echoEnabled: boolean;
  private diagnosticsEnabled: boolean;
  private diagnostics: Diagnostics;
  private crcFunc: CrcFunction;
  private _mutex: Mutex;

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
    this.defaultTimeout = options.timeout ?? 2000;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;
    this.echoEnabled = options.echoEnabled ?? false;
    this.diagnosticsEnabled = !!options.diagnostics;
    this.diagnostics = this.diagnosticsEnabled
      ? new Diagnostics({ loggerName: 'ModbusClient' })
      : new Diagnostics({ loggerName: 'Noop' });

    const algorithm = options.crcAlgorithm ?? 'crc16Modbus';
    const crcFunc = crcAlgorithmMap[algorithm];
    if (!crcFunc) {
      throw new ModbusConfigError(`Unknown CRC algorithm: ${algorithm}`);
    }
    this.crcFunc = crcFunc;
    this._mutex = new Mutex();
    this._setAutoLoggerContext();
  }

  /**
   * Returns the effective transport for the client
   */
  private get _effectiveTransport(): Transport | null {
    return this.transportController.getTransportForSlave(this.slaveId);
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
   * Performs a logical connection check to ensure the client is ready for communication.
   * This method verifies that a transport is available and has been connected by the TransportController.
   * It does NOT initiate the physical connection itself.
   * Throws ModbusNotConnectedError if the transport is not ready.
   */
  public async connect(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      const transport = this._effectiveTransport;

      // Проверка 1: Назначен ли вообще транспорт для этого slaveId?
      if (!transport) {
        // ИСПРАВЛЕНО: Вызываем конструктор без аргументов
        throw new ModbusNotConnectedError();
      }

      // Проверка 2: Был ли транспорт подключен через контроллер?
      // (Теперь это будет работать, так как мы добавили `isOpen` в интерфейс)
      if (!transport.isOpen) {
        // ИСПРАВЛЕНО: Вызываем конструктор без аргументов
        throw new ModbusNotConnectedError();
      }

      // Все проверки пройдены. Клиент готов к работе.
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
      // Мы намеренно не вызываем transport.disconnect() здесь.
      // Это задача TransportController.disconnectAll() или disconnectTransport().
    } finally {
      release();
    }
  }

  /**
   * Converts a buffer to a hex string.
   * @param buffer - The buffer to convert.
   * @returns The hex string representation of the buffer.
   */
  private _toHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  /**
   * Calculates the expected response length based on the PDU.
   * @param pdu - The PDU to calculate the expected response length for.
   * @returns The expected response length, or null if the PDU is invalid.
   */
  private _getExpectedResponseLength(pdu: Uint8Array): number | null {
    if (!pdu || pdu.length === 0) return null;
    const funcCode = pdu[0];
    const modbusFuncCode = ModbusClient.FUNCTION_CODE_MAP.get(funcCode!);
    if (!modbusFuncCode) {
      if (funcCode! & 0x80) {
        return 5; // slave(1) + func(1) + errorCode(1) + CRC(2)
      }
      return null;
    }
    switch (modbusFuncCode) {
      case ModbusFunctionCode.READ_COILS:
      case ModbusFunctionCode.READ_DISCRETE_INPUTS: {
        if (pdu.length < 5) return null;
        const bitCount = (pdu[3]! << 8) | pdu[4]!;
        if (bitCount < 1 || bitCount > 2000) {
          throw new ModbusInvalidQuantityError(bitCount, 1, 2000);
        }
        return 5 + Math.ceil(bitCount / 8);
      }
      case ModbusFunctionCode.READ_HOLDING_REGISTERS:
      case ModbusFunctionCode.READ_INPUT_REGISTERS: {
        if (pdu.length < 5) return null;
        const regCount = (pdu[3]! << 8) | pdu[4]!;
        if (regCount < 1 || regCount > 125) {
          throw new ModbusInvalidQuantityError(regCount, 1, 125);
        }
        return 5 + regCount * 2;
      }
      case ModbusFunctionCode.WRITE_SINGLE_COIL:
      case ModbusFunctionCode.WRITE_SINGLE_REGISTER:
        return 8;
      case ModbusFunctionCode.WRITE_MULTIPLE_COILS:
      case ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
        return 8;
      case ModbusFunctionCode.READ_DEVICE_COMMENT:
        return null;
      case ModbusFunctionCode.WRITE_DEVICE_COMMENT:
        return 5;
      case ModbusFunctionCode.READ_DEVICE_IDENTIFICATION: {
        if (pdu.length < 4) return null;
        if (pdu[2] === 0x00) return 6;
        if (pdu[2] === 0x04) return null;
        return null;
      }
      case ModbusFunctionCode.READ_FILE_LENGTH:
        return 8;
      case ModbusFunctionCode.OPEN_FILE:
        return 8;
      case ModbusFunctionCode.CLOSE_FILE:
        return 5;
      case ModbusFunctionCode.RESTART_CONTROLLER:
        return 0;
      case ModbusFunctionCode.GET_CONTROLLER_TIME:
        return 10;
      case ModbusFunctionCode.SET_CONTROLLER_TIME:
        return 8;
      default:
        return null;
    }
  }

  /**
   * Reads a packet from the Modbus transport.
   * @param timeout - The timeout in milliseconds.
   * @param requestPdu - The PDU of the request packet.
   * @returns The received packet.
   * @throws ModbusTimeoutError If the read operation times out.
   */
  private async _readPacket(
    timeout: number,
    requestPdu: Uint8Array | null = null
  ): Promise<Uint8Array> {
    const start = Date.now();
    let buffer = new Uint8Array(0);
    const expectedLength = requestPdu ? this._getExpectedResponseLength(requestPdu) : null;

    while (true) {
      const timeLeft = timeout - (Date.now() - start);
      if (timeLeft <= 0) throw new ModbusTimeoutError('Read timeout');

      const minPacketLength = 5;
      const bytesToRead = expectedLength
        ? Math.max(1, expectedLength - buffer.length)
        : Math.max(1, minPacketLength - buffer.length);

      const transport = this._effectiveTransport;
      if (!transport) {
        throw new Error(`No transport available for slaveId ${this.slaveId}`);
      }

      const chunk = await transport.read(bytesToRead, timeLeft);
      if (!chunk || chunk.length === 0) continue;

      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer, 0);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      const funcCode = requestPdu ? requestPdu[0] : undefined;
      this._setAutoLoggerContext(funcCode);
      logger.debug('Received chunk:', { bytes: chunk.length, total: buffer.length });

      if (buffer.length >= minPacketLength) {
        try {
          parsePacket(buffer, this.crcFunc);
          return buffer;
        } catch (err: unknown) {
          if (err instanceof ModbusCRCError) {
            logger.error('CRC mismatch detected');
            continue;
          } else if (err instanceof ModbusFramingError) {
            logger.error('Framing error detected');
            continue;
          } else if (err instanceof ModbusParityError) {
            logger.error('Parity error detected');
            continue;
          } else if (err instanceof ModbusNoiseError) {
            logger.error('Noise error detected');
            continue;
          } else if (err instanceof ModbusOverrunError) {
            logger.error('Overrun error detected');
            continue;
          } else if (err instanceof ModbusCollisionError) {
            logger.error('Collision error detected');
            continue;
          } else if (err instanceof ModbusSyncError) {
            logger.error('Sync error detected');
            continue;
          } else if (err instanceof ModbusFrameBoundaryError) {
            logger.error('Frame boundary error detected');
            continue;
          } else if (err instanceof ModbusLRCError) {
            logger.error('LRC error detected');
            continue;
          } else if (err instanceof ModbusChecksumError) {
            logger.error('Checksum error detected');
            continue;
          } else if (err instanceof ModbusMalformedFrameError) {
            logger.error('Malformed frame error detected');
            continue;
          } else if (err instanceof ModbusInvalidFrameLengthError) {
            logger.error('Invalid frame length error detected');
            continue;
          } else if (err instanceof ModbusInvalidTransactionIdError) {
            logger.error('Invalid transaction ID error detected');
            continue;
          } else if (err instanceof ModbusUnexpectedFunctionCodeError) {
            logger.error('Unexpected function code error detected');
            continue;
          } else if (err instanceof ModbusTooManyEmptyReadsError) {
            logger.error('Too many empty reads error detected');
            continue;
          } else if (err instanceof ModbusInterFrameTimeoutError) {
            logger.error('Inter-frame timeout error detected');
            continue;
          } else if (err instanceof ModbusSilentIntervalError) {
            logger.error('Silent interval error detected');
            continue;
          } else if (err instanceof ModbusResponseError) {
            logger.error('Response error detected');
            continue;
          } else if (err instanceof ModbusBufferOverflowError) {
            logger.error('Buffer overflow error detected');
            continue;
          } else if (err instanceof ModbusBufferUnderrunError) {
            logger.error('Buffer underrun error detected');
            continue;
          } else if (err instanceof ModbusMemoryError) {
            logger.error('Memory error detected');
            continue;
          } else if (err instanceof ModbusStackOverflowError) {
            logger.error('Stack overflow error detected');
            continue;
          } else if (err instanceof ModbusInsufficientDataError) {
            logger.error('Insufficient data error detected');
            continue;
          } else if (err instanceof Error && err.message.startsWith('Invalid packet: too short')) {
            continue;
          } else if (err instanceof Error && err.message.startsWith('CRC mismatch')) {
            continue;
          } else {
            throw err;
          }
        }
      }
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

      if (this.diagnosticsEnabled) {
        this.diagnostics.recordRequest(slaveId, funcCode);
        this.diagnostics.recordFunctionCall(funcCode!, slaveId);
      }

      let lastError: unknown;
      const startTime = Date.now();

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        const transport = this._effectiveTransport;
        if (!transport) {
          throw new Error(`No transport available for slaveId ${this.slaveId}`);
        }

        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new ModbusTimeoutError('Timeout before request');

          this._setAutoLoggerContext(funcCodeEnum);
          logger.debug(`Attempt #${attempt + 1} — sending request`, {
            slaveId,
            funcCode,
          });

          const packet = buildPacket(slaveId, pdu, this.crcFunc);

          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataSent(packet.length, slaveId, funcCode);
          }

          await transport.write(packet);
          logger.debug('Packet written to transport', { bytes: packet.length, slaveId, funcCode });

          if (this.echoEnabled) {
            logger.debug('Echo enabled, reading echo back...', { slaveId, funcCode });
            const echoResponse = await transport.read(packet.length, timeLeft);
            if (!echoResponse || echoResponse.length !== packet.length) {
              throw new ModbusInsufficientDataError(
                echoResponse ? echoResponse.length : 0,
                packet.length
              );
            }
            for (let i = 0; i < packet.length; i++) {
              if (packet[i] !== echoResponse[i]) {
                throw new Error('Echo mismatch detected');
              }
            }
            logger.debug('Echo verified successfully', { slaveId, funcCode });
          }

          if (ignoreNoResponse) {
            const elapsed = Date.now() - startTime;
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            }
            logger.info('Request sent, no response expected', {
              slaveId,
              funcCode,
              responseTime: elapsed,
            });
            return undefined;
          }

          const response = await this._readPacket(timeLeft, pdu);

          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataReceived(response.length, slaveId, funcCode);
          }

          const elapsed = Date.now() - startTime;
          const { slaveAddress, pdu: responsePdu } = parsePacket(response, this.crcFunc);

          if (slaveAddress !== slaveId) {
            throw new Error(`Slave address mismatch (expected ${slaveId}, got ${slaveAddress})`);
          }

          if (transport.notifyDeviceConnected) {
            transport.notifyDeviceConnected(slaveId);
          }

          const responseFuncCode = responsePdu[0];
          if ((responseFuncCode! & 0x80) !== 0) {
            const exceptionCode = responsePdu[1];
            const modbusExceptionCode =
              ModbusClient.EXCEPTION_CODE_MAP.get(exceptionCode!) ?? exceptionCode;
            const exceptionMessage =
              MODBUS_EXCEPTION_MESSAGES[exceptionCode as ModbusExceptionCode] ??
              `Unknown exception code: ${exceptionCode}`;

            logger.warn('Modbus exception received', {
              slaveId,
              funcCode,
              exceptionCode,
              exceptionMessage,
              responseTime: elapsed,
            });

            throw new ModbusExceptionError(responseFuncCode! & 0x7f, modbusExceptionCode!);
          }

          if (this.diagnosticsEnabled) {
            this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
          }

          logger.info('Response received', {
            slaveId,
            funcCode,
            responseTime: elapsed,
          });

          return responsePdu;
        } catch (err: unknown) {
          const elapsed = Date.now() - startTime;

          if (!(err instanceof ModbusExceptionError)) {
            if (transport.notifyDeviceDisconnected) {
              let errorType = ConnectionErrorType.UnknownError;
              if (err instanceof ModbusTimeoutError) {
                errorType = ConnectionErrorType.Timeout;
              } else if (err instanceof ModbusCRCError) {
                errorType = ConnectionErrorType.CRCError;
              }
              const errorMessage = err instanceof Error ? err.message : String(err);

              // ТЕПЕРЬ ЭТОТ ВЫЗОВ С 3 АРГУМЕНТАМИ ВЕРНЫЙ
              transport.notifyDeviceDisconnected(slaveId, errorType, errorMessage);
            }
          }

          const isFlushedError = err instanceof ModbusFlushError;
          const errorCode =
            err instanceof Error && err.message.toLowerCase().includes('timeout')
              ? 'timeout'
              : err instanceof Error && err.message.toLowerCase().includes('crc')
                ? 'crc'
                : err instanceof ModbusExceptionError
                  ? 'modbus-exception'
                  : null;

          if (transport.flush) {
            try {
              await transport.flush();
              logger.debug('Transport flushed after error', { slaveId });
            } catch (flushErr) {
              logger.warn('Failed to flush transport after error', {
                slaveId,
                flushError: flushErr,
              });
            }
          }

          if (this.diagnosticsEnabled) {
            this.diagnostics.recordError(err instanceof Error ? err : new Error(String(err)), {
              code: errorCode,
              responseTimeMs: elapsed,
              slaveId,
              funcCode,
              exceptionCode: err instanceof ModbusExceptionError ? err.exceptionCode : null,
            });
          }

          this._setAutoLoggerContext(funcCodeEnum);
          logger.warn(
            `Attempt #${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
            {
              responseTime: elapsed,
              error: err,
              requestHex: this._toHex(pdu),
              slaveId,
              funcCode,
              exceptionCode: err instanceof ModbusExceptionError ? err.exceptionCode : null,
            }
          );

          lastError = err;

          if (isFlushedError) {
            logger.info(`Attempt #${attempt + 1} failed due to flush, will retry`, {
              slaveId,
              funcCode,
            });
          }

          if (
            (ignoreNoResponse &&
              err instanceof Error &&
              err.message.toLowerCase().includes('timeout')) ||
            isFlushedError
          ) {
            logger.info('Operation ignored due to ignoreNoResponse=true and timeout/flush', {
              slaveId,
              funcCode,
              responseTime: elapsed,
            });
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            }
            return undefined;
          }

          if (attempt < this.retryCount) {
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordRetry(1, slaveId, funcCode);
            }
            let delay = this.retryDelay;
            if (isFlushedError) {
              delay = Math.min(50, delay);
              logger.debug(`Retrying after short delay ${delay}ms due to flush`, {
                slaveId,
                funcCode,
              });
            } else {
              logger.debug(`Retrying after delay ${delay}ms`, { slaveId, funcCode });
            }
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            if (transport.flush) {
              try {
                await transport.flush();
                logger.debug('Final transport flush after all retries failed', { slaveId });
              } catch (flushErr) {
                logger.warn('Failed to final flush transport', { slaveId, flushError: flushErr });
              }
            }
            logger.error(`All ${this.retryCount + 1} attempts exhausted`, {
              error: lastError,
              slaveId,
              funcCode,
              responseTime: elapsed,
            });
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
          }
        }
      }
      throw new Error('Unexpected end of _sendRequest function');
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
  ): ConvertedRegisters<T> {
    if (!registers || !Array.isArray(registers)) {
      throw new ModbusDataConversionError(registers, 'non-empty array');
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
        throw new ModbusDataConversionError(type, 'supported type');
    }
  }

  public async readHoldingRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<ConvertedRegisters<T>> {
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

  public async readInputRegisters<T extends RegisterType>(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<ConvertedRegisters<T>> {
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

  public async reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse> {
    const pdu = buildReportSlaveIdRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReportSlaveIdResponse(responsePdu);
  }

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

  public async readFileLength(timeout?: number): Promise<ReadFileLengthResponse> {
    const pdu = buildReadFileLengthRequest('');
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReadFileLengthResponse(responsePdu);
  }

  public async openFile(filename: string, timeout?: number): Promise<OpenFileResponse> {
    if (typeof filename !== 'string' || filename.length === 0) {
      throw new ModbusDataConversionError(filename, 'non-empty string');
    }
    const pdu = buildOpenFileRequest(filename);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseOpenFileResponse(responsePdu);
  }

  public async closeFile(timeout?: number): Promise<CloseFileResponse> {
    const pdu = buildCloseFileRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    if (responsePdu === undefined) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const transport = this._effectiveTransport;
      if (transport && transport.flush) {
        await transport.flush();
      }
      return true as CloseFileResponse;
    }
    const result = parseCloseFileResponse(responsePdu);
    await new Promise(resolve => setTimeout(resolve, 100));
    const transport = this._effectiveTransport;
    if (transport && transport.flush) {
      await transport.flush();
    }
    return result;
  }

  public async restartController(timeout?: number): Promise<RestartControllerResponse> {
    const pdu = buildRestartControllerRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    if (responsePdu === undefined) {
      return { success: true } as RestartControllerResponse;
    }
    return parseRestartControllerResponse(responsePdu);
  }

  public async getControllerTime(timeout?: number): Promise<GetControllerTimeResponse> {
    const pdu = buildGetControllerTimeRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseGetControllerTimeResponse(responsePdu);
  }

  public async setControllerTime(
    datetime: Date,
    timeout?: number
  ): Promise<SetControllerTimeResponse> {
    if (!(datetime instanceof Date) || isNaN(datetime.getTime())) {
      throw new ModbusDataConversionError(datetime, 'valid Date object');
    }
    const time: ControllerTime = {
      seconds: datetime.getSeconds(),
      minutes: datetime.getMinutes(),
      hours: datetime.getHours(),
      day: datetime.getDate(),
      month: datetime.getMonth() + 1,
      year: datetime.getFullYear(),
    };
    const pdu = buildSetControllerTimeRequest(time);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseSetControllerTimeResponse(responsePdu);
  }
}

export = ModbusClient;
