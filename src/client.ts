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
// ⣿⣿⣡⢴⠃⢾⠓⠒⠢⠤⠼⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠛⠲⠄⡷⢄⣿⣿
// ⣿⡏⠁⢸⠄⠈⣿⣿⠉⠓⣶⣶⡖⠒⠒⠒⠒⢒⣶⣶⡒⠛⢹⣿⠁⠄⡇⠄⠙⣿
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

import { ModbusTimeoutError, ModbusExceptionError, ModbusFlushError } from './errors.js';

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
} from './types/modbus-types.js';

const crcAlgorithmMap = {
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

class ModbusClient {
  private transport: Transport;
  private slaveId: number;
  private defaultTimeout: number;
  private retryCount: number;
  private retryDelay: number;
  private echoEnabled: boolean;
  private diagnosticsEnabled: boolean;
  private diagnostics: Diagnostics;
  private crcFunc: (data: Uint8Array) => Uint8Array;
  private _mutex: Mutex;

  constructor(transport: Transport, slaveId: number = 1, options: ModbusClientOptions = {}) {
    if (slaveId < 1 || slaveId > 255) {
      throw new Error('Invalid slave ID. Must be a number between 1 and 255');
    }

    this.transport = transport;
    this.slaveId = slaveId;
    this.defaultTimeout = options.timeout || 2000;
    this.retryCount = options.retryCount || 0;
    this.retryDelay = options.retryDelay || 100;
    this.echoEnabled = options.echoEnabled || false;

    this.diagnosticsEnabled = !!options.diagnostics;
    this.diagnostics = this.diagnosticsEnabled
      ? new Diagnostics({ loggerName: 'ModbusClient' })
      : new Diagnostics({ loggerName: 'Noop' });

    this.crcFunc = crcAlgorithmMap[options.crcAlgorithm || 'crc16Modbus'];
    if (!this.crcFunc) throw new Error(`Unknown CRC algorithm: ${options.crcAlgorithm}`);

    this._mutex = new Mutex();

    this._setAutoLoggerContext();
  }

  /**
   * Включает логгер ModbusClient
   * @param level - Уровень логирования
   */
  enableLogger(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info') {
    logger.setLevel(level);
  }

  /**
   * Отключает логгер ModbusClient (устанавливает самый высокий уровень - error)
   */
  disableLogger() {
    logger.setLevel('error');
  }

  /**
   * Устанавливает контекст для логгера (slaveId, functionCode и т.д.)
   * @param context - Контекст для логгера
   */
  setLoggerContext(context: LoggerContext) {
    logger.addGlobalContext(context);
  }

  /**
   * Устанавливает контекст логгера автоматически на основе текущих параметров
   */
  private _setAutoLoggerContext(funcCode: number | null = null) {
    const context: LoggerContext = {
      slaveId: this.slaveId,
      transport: this.transport.constructor.name,
    };

    if (funcCode !== null) {
      context.funcCode = funcCode;
    }

    logger.addGlobalContext(context);
  }

  /**
   * Establishes a connection to the Modbus transport.
   * Logs the connection status upon successful connection.
   */
  async connect() {
    const release = await this._mutex.acquire();
    try {
      await this.transport.connect();
      this._setAutoLoggerContext();
      logger.info('Transport connected', { transport: this.transport.constructor.name });
    } finally {
      release();
    }
  }

  /**
   * Closes the connection to the Modbus transport.
   * Logs the disconnection status upon successful disconnection.
   */
  async disconnect() {
    const release = await this._mutex.acquire();
    try {
      await this.transport.disconnect();
      this._setAutoLoggerContext();
      logger.info('Transport disconnected', { transport: this.transport.constructor.name });
    } finally {
      release();
    }
  }

  setSlaveId(slaveId: number) {
    if (typeof slaveId !== 'number' || slaveId < 1 || slaveId > 255) {
      throw new Error('Invalid slave ID. Must be a number between 1 and 255');
    }
    this.slaveId = slaveId;
    this._setAutoLoggerContext();
  }

  /**
   * Converts a buffer to a hex string.
   * @param buffer - The buffer to convert.
   * @returns The hex string representation of the buffer.
   */
  private _toHex(buffer: Uint8Array) {
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

    const funcCode = pdu[0]!;

    switch (funcCode) {
      // Standard Modbus functions
      case 0x01: // Read Coils
      case 0x02: {
        // Read Discrete Inputs
        if (pdu.length < 5) return null;
        const bitCount = (pdu[3]! << 8) | pdu[4]!;
        return 5 + Math.ceil(bitCount / 8); // slave(1) + func(1) + byteCount(1) + data(N) + CRC(2)
      }

      case 0x03: // Read Holding Registers
      case 0x04: {
        // Read Input Registers
        if (pdu.length < 5) return null;
        const regCount = (pdu[3]! << 8) | pdu[4]!;
        return 5 + regCount * 2; // slave(1) + func(1) + byteCount(1) + data(N*2) + CRC(2)
      }

      case 0x05: // Write Single Coil
      case 0x06: // Write Single Register
        return 8; // slave(1) + func(1) + address(2) + value(2) + CRC(2)

      case 0x0f: // Write Multiple Coils
      case 0x10: // Write Multiple Registers
        return 8; // slave(1) + func(1) + address(2) + quantity(2) + CRC(2)

      case 0x08: // Diagnostics
        return 8; // slave(1) + func(1) + subFunc(2) + data(2) + CRC(2)

      // Special functions for SGM130
      case 0x14: // Read Device Comment
        return null;

      case 0x15: // Write Device Comment
        return 5; // slave(1) + func(1) + channel(1) + length(1) + CRC(2)

      case 0x2b: {
        // Read Device Identification
        if (pdu.length < 4) return null;

        // Для ошибки
        if (pdu[2]! === 0x00) return 6; // slave(1) + func(1) + interface(1) + error(1) + CRC(2)

        // Для индивидуального запроса (категория 0x04)
        if (pdu[2]! === 0x04) {
          return null; // Длина строки неизвестна заранее
        }

        // Для основных/вспомогательных категорий
        return null; // Количество строк и их длины неизвестны заранее
      }

      case 0x52: // Read File Length
        return 8; // slave(1) + func(1) + length(4) + CRC(2)

      case 0x55: // Open File
        return 8; // slave(1) + func(1) + length(4) + CRC(2)

      case 0x57: // Close File
        return 5; // slave(1) + func(1) + status(1) + CRC(2)

      case 0x5c: // Restart Controller
        return 0; // Ответа не ожидается

      case 0x6e: // Get Controller Time
        return 10; // slave(1) + func(1) + time(6) + CRC(2)

      case 0x6f: // Set Controller Time
        return 8; // slave(1) + func(1) + status(2) + CRC(2)

      // Обработка ошибок
      default:
        if (funcCode & 0x80) {
          // Error response
          return 5; // slave(1) + func(1) + errorCode(1) + CRC(2)
        }
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
  private async _readPacket(timeout: number, requestPdu: Uint8Array | null = null) {
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

      const chunk = await this.transport.read(bytesToRead, timeLeft);
      if (!chunk || chunk.length === 0) continue;

      // Исправление: используем ArrayBuffer для промежуточного представления
      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer, 0);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;

      this._setAutoLoggerContext(requestPdu ? requestPdu[0]! : null);
      logger.debug('Received chunk:', { bytes: chunk.length, total: buffer.length });

      // Проверяем, достаточно ли данных для минимального пакета
      if (buffer.length >= minPacketLength) {
        try {
          // Пробуем распарсить пакет
          parsePacket(buffer, this.crcFunc);
          // Если не было исключения - пакет корректный
          return buffer;
        } catch (err: unknown) {
          if (err instanceof Error && err.message.startsWith('Invalid packet: too short')) {
            // Продолжаем чтение
            continue;
          }
          if (err instanceof Error && err.message.startsWith('CRC mismatch')) {
            // Продолжаем чтение, возможно пакет ещё не полный
            continue;
          }
          // Другая ошибка - пробрасываем её
          throw err;
        }
      }
    }
  }

  /**
   * Sends a request to the Modbus transport.
   * @param pdu - The PDU of the request packet.
   * @param timeout - The timeout in milliseconds.
   * @param ignoreNoResponse - Whether to ignore no response.
   * @returns The received packet.
   * @throws ModbusTimeoutError If the send operation times out.
   */
  private async _sendRequest(
    pdu: Uint8Array,
    timeout: number = this.defaultTimeout,
    ignoreNoResponse: boolean = false
  ): Promise<Uint8Array | undefined> {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0]!;
      const slaveId = this.slaveId;

      // Записываем статистику только если диагностика включена
      if (this.diagnosticsEnabled) {
        this.diagnostics.recordRequest(slaveId, funcCode);
        this.diagnostics.recordFunctionCall(funcCode, slaveId);
      }

      let lastError: unknown;
      const startTime = Date.now();

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new ModbusTimeoutError('Timeout before request');

          this._setAutoLoggerContext(funcCode);
          logger.debug(`Attempt #${attempt + 1} — sending request`, {
            slaveId,
            funcCode,
          });

          const packet = buildPacket(slaveId, pdu, this.crcFunc);

          // Записываем данные только если диагностика включена
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataSent(packet.length, slaveId, funcCode);
          }

          await this.transport.write(packet);
          logger.debug('Packet written to transport', { bytes: packet.length, slaveId, funcCode });

          if (this.echoEnabled) {
            logger.debug('Echo enabled, reading echo back...', { slaveId, funcCode });
            const echoResponse = await this.transport.read(packet.length, timeLeft);
            if (!echoResponse || echoResponse.length !== packet.length) {
              throw new Error(
                `Echo length mismatch (expected ${packet.length}, got ${echoResponse ? echoResponse.length : 0})`
              );
            }
            for (let i = 0; i < packet.length; i++) {
              if (packet[i]! !== echoResponse[i]!) {
                throw new Error('Echo mismatch detected');
              }
            }
            logger.debug('Echo verified successfully', { slaveId, funcCode });
          }

          if (ignoreNoResponse) {
            const elapsed = Date.now() - startTime;

            // Записываем успех только если диагностика включена
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

          // Записываем полученные данные только если диагностика включена
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataReceived(response.length, slaveId, funcCode);
          }

          const elapsed = Date.now() - startTime;
          const { slaveAddress, pdu: responsePdu } = parsePacket(response, this.crcFunc);

          if (slaveAddress !== slaveId) {
            throw new Error(`Slave address mismatch (expected ${slaveId}, got ${slaveAddress})`);
          }

          const responseFuncCode = responsePdu[0]!;
          if ((responseFuncCode & 0x80) !== 0) {
            const exceptionCode = responsePdu[1]!;
            throw new ModbusExceptionError(responseFuncCode & 0x7f, exceptionCode);
          }

          // Записываем успех только если диагностика включена
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
          const isFlushedError = err instanceof ModbusFlushError;
          const errorCode =
            err instanceof Error && err.message.toLowerCase().includes('timeout')
              ? 'timeout'
              : err instanceof Error && err.message.toLowerCase().includes('crc')
                ? 'crc'
                : err instanceof ModbusExceptionError
                  ? 'modbus-exception'
                  : null;

          // Записываем ошибку только если диагностика включена
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordError(err instanceof Error ? err : new Error(String(err)), {
              code: errorCode,
              responseTimeMs: elapsed,
              slaveId,
              funcCode,
              exceptionCode: err instanceof ModbusExceptionError ? err.exceptionCode : null,
            });
          }

          this._setAutoLoggerContext(funcCode);
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

            // Записываем успех только если диагностика включена
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            }

            return undefined;
          }

          if (attempt < this.retryCount) {
            // Записываем повторную попытку только если диагностика включена
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
            logger.error(`All ${this.retryCount + 1} attempts exhausted`, {
              error: lastError,
              slaveId,
              funcCode,
              responseTime: elapsed,
            });
            if (lastError instanceof Error) {
              throw lastError;
            } else {
              throw new Error(String(lastError));
            }
          }
        }
      }

      // Явно бросаем ошибку, если цикл завершился без возврата значения
      throw new Error('Unexpected end of _sendRequest function');
    } finally {
      release();
    }
  }

  /**
   * Converts Modbus registers to a buffer.
   * @param registers - The registers to convert.
   * @param type - The type of the registers.
   * @returns The buffer containing the converted registers.
   */
  private _convertRegisters(registers: number[], type: string = 'uint16'): ConvertedRegisters {
    const buffer = new ArrayBuffer(registers.length * 2);
    const view = new DataView(buffer);

    // Big endian запись (Modbus по умолчанию)
    registers.forEach((reg, i) => {
      view.setUint16(i * 2, reg, false);
    });

    const read32 = (
      method: 'getUint32' | 'getInt32' | 'getFloat32',
      littleEndian: boolean = false
    ): number[] => {
      const result: number[] = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        switch (method) {
          case 'getUint32':
            result.push(view.getUint32(i * 2, littleEndian));
            break;
          case 'getInt32':
            result.push(view.getInt32(i * 2, littleEndian));
            break;
          case 'getFloat32':
            result.push(view.getFloat32(i * 2, littleEndian));
            break;
        }
      }
      return result;
    };

    const read64 = (
      method: 'getUint64' | 'getInt64' | 'getDouble',
      littleEndian: boolean = false
    ): bigint[] | number[] => {
      if (method === 'getDouble') {
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
      } else {
        const result: bigint[] = [];
        for (let i = 0; i < registers.length - 3; i += 4) {
          const tempBuf = new ArrayBuffer(8);
          const tempView = new DataView(tempBuf);
          for (let j = 0; j < 8; j++) {
            tempView.setUint8(j, view.getUint8(i * 2 + j));
          }

          if (method === 'getUint64') {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            result.push((high << 32n) | low);
          } else {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            let value = (high << 32n) | low;
            if (value & (1n << 63n)) value -= 1n << 64n;
            result.push(value);
          }
        }
        return result;
      }
    };

    const getSwapped32 = (i: number, mode: string) => {
      const a = view.getUint8(i * 2);
      const b = view.getUint8(i * 2 + 1);
      const c = view.getUint8(i * 2 + 2);
      const d = view.getUint8(i * 2 + 3);
      let bytes: number[] = [];

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

    const read32Swapped = (
      method: 'getUint32' | 'getInt32' | 'getFloat32',
      mode: string
    ): number[] => {
      const result: number[] = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        const tempView = getSwapped32(i, mode);
        switch (method) {
          case 'getUint32':
            result.push(tempView.getUint32(0, false));
            break;
          case 'getInt32':
            result.push(tempView.getInt32(0, false));
            break;
          case 'getFloat32':
            result.push(tempView.getFloat32(0, false));
            break;
        }
      }
      return result;
    };

    switch (type.toLowerCase()) {
      // 16-бит
      case 'uint16':
        return registers;
      case 'int16':
        return registers.map((_, i) => view.getInt16(i * 2, false));

      // 32-бит
      case 'uint32':
        return read32('getUint32');
      case 'int32':
        return read32('getInt32');
      case 'float':
        return read32('getFloat32');

      // 32-бит LE
      case 'uint32_le':
        return read32('getUint32', true);
      case 'int32_le':
        return read32('getInt32', true);
      case 'float_le':
        return read32('getFloat32', true);

      // 32-бит со swap
      case 'uint32_sw':
        return read32Swapped('getUint32', 'sw');
      case 'int32_sw':
        return read32Swapped('getInt32', 'sw');
      case 'float_sw':
        return read32Swapped('getFloat32', 'sw');

      case 'uint32_sb':
        return read32Swapped('getUint32', 'sb');
      case 'int32_sb':
        return read32Swapped('getInt32', 'sb');
      case 'float_sb':
        return read32Swapped('getFloat32', 'sb');

      case 'uint32_sbw':
        return read32Swapped('getUint32', 'sbw');
      case 'int32_sbw':
        return read32Swapped('getInt32', 'sbw');
      case 'float_sbw':
        return read32Swapped('getFloat32', 'sbw');

      // 32-бит little-endian через полные swap
      case 'uint32_le_sw':
        return read32Swapped('getUint32', 'le_sw');
      case 'int32_le_sw':
        return read32Swapped('getInt32', 'le_sw');
      case 'float_le_sw':
        return read32Swapped('getFloat32', 'le_sw');

      case 'uint32_le_sb':
        return read32Swapped('getUint32', 'le_sb');
      case 'int32_le_sb':
        return read32Swapped('getInt32', 'le_sb');
      case 'float_le_sb':
        return read32Swapped('getFloat32', 'le_sb');

      case 'uint32_le_sbw':
        return read32Swapped('getUint32', 'le_sbw');
      case 'int32_le_sbw':
        return read32Swapped('getInt32', 'le_sbw');
      case 'float_le_sbw':
        return read32Swapped('getFloat32', 'le_sbw');

      // 64-бит
      case 'uint64':
        return read64('getUint64');
      case 'int64':
        return read64('getInt64');
      case 'double':
        return read64('getDouble');

      // 64-бит LE
      case 'uint64_le':
        return read64('getUint64', true);
      case 'int64_le':
        return read64('getInt64', true);
      case 'double_le':
        return read64('getDouble', true);

      // Разное
      case 'hex':
        return registers.map(r => r.toString(16).toUpperCase().padStart(4, '0'));

      case 'string': {
        let str = '';
        for (let i = 0; i < registers.length; i++) {
          const high = (registers[i]! >> 8) & 0xff;
          const low = registers[i]! & 0xff;
          if (high !== 0) str += String.fromCharCode(high);
          if (low !== 0) str += String.fromCharCode(low);
        }
        return [str];
      }

      case 'bool':
        return registers.map(r => r !== 0);

      case 'binary':
        return registers.map(r =>
          r
            .toString(2)
            .padStart(16, '0')
            .split('')
            .map(b => b === '1')
        );

      case 'bcd':
        return registers.map(r => {
          const high = (r >> 8) & 0xff;
          const low = r & 0xff;
          return ((high >> 4) * 10 + (high & 0x0f)) * 100 + (low >> 4) * 10 + (low & 0x0f);
        });

      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }

  // --- Public method's Modbus ---

  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - The options for the read operation.
   * @returns The buffer containing the read registers.
   */
  async readHoldingRegisters(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<ConvertedRegisters> {
    const pdu = buildReadHoldingRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    const registers = parseReadHoldingRegistersResponse(responsePdu);

    const type = options.type || 'uint16';
    return this._convertRegisters(registers, type);
  }

  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - The options for the read operation.
   * @returns The buffer containing the read registers.
   */
  async readInputRegisters(
    startAddress: number,
    quantity: number,
    options: ConvertRegisterOptions = {}
  ): Promise<ConvertedRegisters> {
    const responsePdu = await this._sendRequest(
      buildReadInputRegistersRequest(startAddress, quantity)
    );
    if (!responsePdu) {
      throw new Error('No response received');
    }
    const registers = parseReadInputRegistersResponse(responsePdu);

    const type = options.type || 'uint16';
    return this._convertRegisters(registers, type);
  }

  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write.
   * @param value - The value to write to the register.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<WriteSingleRegisterResponse> {
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
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleRegisters(
    startAddress: number,
    values: number[],
    timeout?: number
  ): Promise<WriteMultipleRegistersResponse> {
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
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readCoils(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadCoilsResponse> {
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
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readDiscreteInputs(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<ReadDiscreteInputsResponse> {
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
   * @param value - The value to write to the coil.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleCoil(
    address: number,
    value: boolean | number,
    timeout?: number
  ): Promise<WriteSingleCoilResponse> {
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
   * @param values - The values to write to the coils.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleCoils(
    startAddress: number,
    values: boolean[],
    timeout?: number
  ): Promise<WriteMultipleCoilsResponse> {
    const pdu = buildWriteMultipleCoilsRequest(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseWriteMultipleCoilsResponse(responsePdu);
  }

  /**
   * Reports the slave ID of the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async reportSlaveId(timeout?: number): Promise<ReportSlaveIdResponse> {
    const pdu = buildReportSlaveIdRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReportSlaveIdResponse(responsePdu);
  }

  /**
   * Reads the device identification from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readDeviceIdentification(timeout?: number): Promise<ReadDeviceIdentificationResponse> {
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

  /**
   * Reads the file length from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readFileLength(timeout?: number): Promise<ReadFileLengthResponse> {
    const pdu = buildReadFileLengthRequest('');
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseReadFileLengthResponse(responsePdu);
  }

  /**
   * Opens a file on the Modbus device.
   * @param filename - The name of the file to open.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async openFile(filename: string, timeout?: number): Promise<OpenFileResponse> {
    const pdu = buildOpenFileRequest(filename);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseOpenFileResponse(responsePdu);
  }

  /**
   * Closes a file on the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async closeFile(timeout?: number): Promise<CloseFileResponse> {
    const pdu = buildCloseFileRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);

    // Если responsePdu === undefined (устройство не ответило), возвращаем успех
    if (responsePdu === undefined) {
      // Ждем немного и очищаем буфер
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.transport.flush) {
        await this.transport.flush();
      }
      return true;
    }

    const result = parseCloseFileResponse(responsePdu);

    // Ждем немного и очищаем буфер
    await new Promise(resolve => setTimeout(resolve, 100));
    if (this.transport.flush) {
      await this.transport.flush();
    }

    return result;
  }

  /**
   * Restarts the controller on the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async restartController(timeout?: number): Promise<RestartControllerResponse> {
    const pdu = buildRestartControllerRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    if (responsePdu === undefined) {
      throw new Error('No response received');
    }
    return parseRestartControllerResponse(responsePdu);
  }

  /**
   * Gets the controller time from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async getControllerTime(timeout?: number): Promise<GetControllerTimeResponse> {
    const pdu = buildGetControllerTimeRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error('No response received');
    }
    return parseGetControllerTimeResponse(responsePdu);
  }

  /**
   * Sets the controller time on the Modbus device.
   * @param datetime - The datetime to set on the controller.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async setControllerTime(datetime: Date, timeout?: number): Promise<SetControllerTimeResponse> {
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
