"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_async_mutex = require("async-mutex");
var import_read_holding_registers = require("./function-codes/read-holding-registers.js");
var import_read_input_registers = require("./function-codes/read-input-registers.js");
var import_write_single_register = require("./function-codes/write-single-register.js");
var import_write_multiple_registers = require("./function-codes/write-multiple-registers.js");
var import_read_coils = require("./function-codes/read-coils.js");
var import_read_discrete_inputs = require("./function-codes/read-discrete-inputs.js");
var import_write_single_coil = require("./function-codes/write-single-coil.js");
var import_write_multiple_coils = require("./function-codes/write-multiple-coils.js");
var import_report_slave_id = require("./function-codes/report-slave-id.js");
var import_read_device_identification = require("./function-codes/read-device-identification.js");
var import_read_file_length = require("./function-codes/SGM130/read-file-length.js");
var import_openFile = require("./function-codes/SGM130/openFile.js");
var import_closeFile = require("./function-codes/SGM130/closeFile.js");
var import_restart_controller = require("./function-codes/SGM130/restart-controller.js");
var import_get_controller_time = require("./function-codes/SGM130/get-controller-time.js");
var import_set_controller_time = require("./function-codes/SGM130/set-controller-time.js");
var import_errors = require("./errors.js");
var import_constants = require("./constants/constants.js");
var import_packet_builder = require("./packet-builder.js");
var import_logger = __toESM(require("./logger.js"));
var import_diagnostics = require("./utils/diagnostics.js");
var import_crc = require("./utils/crc.js");
const crcAlgorithmMap = {
  crc16Modbus: import_crc.crc16Modbus,
  crc16CcittFalse: import_crc.crc16CcittFalse,
  crc32: import_crc.crc32,
  crc8: import_crc.crc8,
  crc1: import_crc.crc1,
  crc8_1wire: import_crc.crc8_1wire,
  crc8_dvbs2: import_crc.crc8_dvbs2,
  crc16_kermit: import_crc.crc16_kermit,
  crc16_xmodem: import_crc.crc16_xmodem,
  crc24: import_crc.crc24,
  crc32mpeg: import_crc.crc32mpeg,
  crcjam: import_crc.crcjam
};
const logger = new import_logger.default();
logger.setLevel("error");
class ModbusClient {
  transport;
  slaveId;
  defaultTimeout;
  retryCount;
  retryDelay;
  echoEnabled;
  diagnosticsEnabled;
  diagnostics;
  crcFunc;
  _mutex;
  // Кэшированные значения для производительности
  static FUNCTION_CODE_MAP = /* @__PURE__ */ new Map([
    [1, import_constants.ModbusFunctionCode.READ_COILS],
    [2, import_constants.ModbusFunctionCode.READ_DISCRETE_INPUTS],
    [3, import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS],
    [4, import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS],
    [5, import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL],
    [6, import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER],
    [15, import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS],
    [16, import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS],
    [17, import_constants.ModbusFunctionCode.REPORT_SLAVE_ID],
    [20, import_constants.ModbusFunctionCode.READ_DEVICE_COMMENT],
    [21, import_constants.ModbusFunctionCode.WRITE_DEVICE_COMMENT],
    [43, import_constants.ModbusFunctionCode.READ_DEVICE_IDENTIFICATION],
    [82, import_constants.ModbusFunctionCode.READ_FILE_LENGTH],
    [90, import_constants.ModbusFunctionCode.READ_FILE_CHUNK],
    [85, import_constants.ModbusFunctionCode.OPEN_FILE],
    [87, import_constants.ModbusFunctionCode.CLOSE_FILE],
    [92, import_constants.ModbusFunctionCode.RESTART_CONTROLLER],
    [110, import_constants.ModbusFunctionCode.GET_CONTROLLER_TIME],
    [111, import_constants.ModbusFunctionCode.SET_CONTROLLER_TIME]
  ]);
  static EXCEPTION_CODE_MAP = /* @__PURE__ */ new Map([
    [1, import_constants.ModbusExceptionCode.ILLEGAL_FUNCTION],
    [2, import_constants.ModbusExceptionCode.ILLEGAL_DATA_ADDRESS],
    [3, import_constants.ModbusExceptionCode.ILLEGAL_DATA_VALUE],
    [4, import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE],
    [5, import_constants.ModbusExceptionCode.ACKNOWLEDGE],
    [6, import_constants.ModbusExceptionCode.SLAVE_DEVICE_BUSY],
    [8, import_constants.ModbusExceptionCode.MEMORY_PARITY_ERROR],
    [10, import_constants.ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE],
    [11, import_constants.ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED]
  ]);
  constructor(transport, slaveId = 1, options = {}) {
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 255) {
      throw new Error("Invalid slave ID. Must be an integer between 1 and 255");
    }
    this.transport = transport;
    this.slaveId = slaveId;
    this.defaultTimeout = options.timeout ?? 2e3;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;
    this.echoEnabled = options.echoEnabled ?? false;
    this.diagnosticsEnabled = !!options.diagnostics;
    this.diagnostics = this.diagnosticsEnabled ? new import_diagnostics.Diagnostics({ loggerName: "ModbusClient" }) : new import_diagnostics.Diagnostics({ loggerName: "Noop" });
    const algorithm = options.crcAlgorithm ?? "crc16Modbus";
    const crcFunc = crcAlgorithmMap[algorithm];
    if (!crcFunc) {
      throw new Error(`Unknown CRC algorithm: ${algorithm}`);
    }
    this.crcFunc = crcFunc;
    this._mutex = new import_async_mutex.Mutex();
    this._setAutoLoggerContext();
  }
  /**
   * Включает логгер ModbusClient
   * @param level - Уровень логирования
   */
  enableLogger(level = "info") {
    logger.setLevel(level);
  }
  /**
   * Отключает логгер ModbusClient (устанавливает самый высокий уровень - error)
   */
  disableLogger() {
    logger.setLevel("error");
  }
  /**
   * Устанавливает контекст для логгера (slaveId, functionCode и т.д.)
   * @param context - Контекст для логгера
   */
  setLoggerContext(context) {
    logger.addGlobalContext(context);
  }
  /**
   * Устанавливает контекст логгера автоматически на основе текущих параметров
   */
  _setAutoLoggerContext(funcCode = null) {
    const context = {
      slaveId: this.slaveId,
      transport: this.transport.constructor.name
    };
    if (funcCode !== null) {
      context.funcCode = typeof funcCode === "number" ? funcCode : funcCode;
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
      logger.info("Transport connected", { transport: this.transport.constructor.name });
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
      logger.info("Transport disconnected", { transport: this.transport.constructor.name });
    } finally {
      release();
    }
  }
  setSlaveId(slaveId) {
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 255) {
      throw new Error("Invalid slave ID. Must be an integer between 1 and 255");
    }
    this.slaveId = slaveId;
    this._setAutoLoggerContext();
  }
  /**
   * Converts a buffer to a hex string.
   * @param buffer - The buffer to convert.
   * @returns The hex string representation of the buffer.
   */
  _toHex(buffer) {
    return Array.from(buffer).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }
  /**
   * Calculates the expected response length based on the PDU.
   * @param pdu - The PDU to calculate the expected response length for.
   * @returns The expected response length, or null if the PDU is invalid.
   */
  _getExpectedResponseLength(pdu) {
    if (!pdu || pdu.length === 0) return null;
    const funcCode = pdu[0];
    const modbusFuncCode = ModbusClient.FUNCTION_CODE_MAP.get(funcCode);
    if (!modbusFuncCode) {
      if (funcCode & 128) {
        return 5;
      }
      return null;
    }
    switch (modbusFuncCode) {
      case import_constants.ModbusFunctionCode.READ_COILS:
      case import_constants.ModbusFunctionCode.READ_DISCRETE_INPUTS: {
        if (pdu.length < 5) return null;
        const bitCount = pdu[3] << 8 | pdu[4];
        return 5 + Math.ceil(bitCount / 8);
      }
      case import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS:
      case import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS: {
        if (pdu.length < 5) return null;
        const regCount = pdu[3] << 8 | pdu[4];
        return 5 + regCount * 2;
      }
      case import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL:
      case import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER:
        return 8;
      // slave(1) + func(1) + address(2) + value(2) + CRC(2)
      case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS:
      case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
        return 8;
      // slave(1) + func(1) + address(2) + quantity(2) + CRC(2)
      case import_constants.ModbusFunctionCode.READ_DEVICE_COMMENT:
        return null;
      case import_constants.ModbusFunctionCode.WRITE_DEVICE_COMMENT:
        return 5;
      // slave(1) + func(1) + channel(1) + length(1) + CRC(2)
      case import_constants.ModbusFunctionCode.READ_DEVICE_IDENTIFICATION: {
        if (pdu.length < 4) return null;
        if (pdu[2] === 0) return 6;
        if (pdu[2] === 4) return null;
        return null;
      }
      case import_constants.ModbusFunctionCode.READ_FILE_LENGTH:
        return 8;
      // slave(1) + func(1) + length(4) + CRC(2)
      case import_constants.ModbusFunctionCode.OPEN_FILE:
        return 8;
      // slave(1) + func(1) + length(4) + CRC(2)
      case import_constants.ModbusFunctionCode.CLOSE_FILE:
        return 5;
      // slave(1) + func(1) + status(1) + CRC(2)
      case import_constants.ModbusFunctionCode.RESTART_CONTROLLER:
        return 0;
      // Ответа не ожидается
      case import_constants.ModbusFunctionCode.GET_CONTROLLER_TIME:
        return 10;
      // slave(1) + func(1) + time(6) + CRC(2)
      case import_constants.ModbusFunctionCode.SET_CONTROLLER_TIME:
        return 8;
      // slave(1) + func(1) + status(2) + CRC(2)
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
  async _readPacket(timeout, requestPdu = null) {
    const start = Date.now();
    let buffer = new Uint8Array(0);
    const expectedLength = requestPdu ? this._getExpectedResponseLength(requestPdu) : null;
    while (true) {
      const timeLeft = timeout - (Date.now() - start);
      if (timeLeft <= 0) throw new import_errors.ModbusTimeoutError("Read timeout");
      const minPacketLength = 5;
      const bytesToRead = expectedLength ? Math.max(1, expectedLength - buffer.length) : Math.max(1, minPacketLength - buffer.length);
      const chunk = await this.transport.read(bytesToRead, timeLeft);
      if (!chunk || chunk.length === 0) continue;
      const newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer, 0);
      newBuffer.set(chunk, buffer.length);
      buffer = newBuffer;
      const funcCode = requestPdu ? requestPdu[0] : null;
      this._setAutoLoggerContext(funcCode);
      logger.debug("Received chunk:", { bytes: chunk.length, total: buffer.length });
      if (buffer.length >= minPacketLength) {
        try {
          (0, import_packet_builder.parsePacket)(buffer, this.crcFunc);
          return buffer;
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Invalid packet: too short")) {
            continue;
          }
          if (err instanceof Error && err.message.startsWith("CRC mismatch")) {
            continue;
          }
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
   * @returns The received packet or undefined if no response is expected.
   * @throws ModbusTimeoutError If the send operation times out.
   */
  async _sendRequest(pdu, timeout = this.defaultTimeout, ignoreNoResponse = false) {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0];
      const funcCodeEnum = ModbusClient.FUNCTION_CODE_MAP.get(funcCode) ?? funcCode;
      const slaveId = this.slaveId;
      if (this.diagnosticsEnabled) {
        this.diagnostics.recordRequest(slaveId, funcCode);
        this.diagnostics.recordFunctionCall(funcCode, slaveId);
      }
      let lastError;
      const startTime = Date.now();
      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new import_errors.ModbusTimeoutError("Timeout before request");
          this._setAutoLoggerContext(funcCodeEnum);
          logger.debug(`Attempt #${attempt + 1} \u2014 sending request`, {
            slaveId,
            funcCode
          });
          const packet = (0, import_packet_builder.buildPacket)(slaveId, pdu, this.crcFunc);
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataSent(packet.length, slaveId, funcCode);
          }
          await this.transport.write(packet);
          logger.debug("Packet written to transport", { bytes: packet.length, slaveId, funcCode });
          if (this.echoEnabled) {
            logger.debug("Echo enabled, reading echo back...", { slaveId, funcCode });
            const echoResponse = await this.transport.read(packet.length, timeLeft);
            if (!echoResponse || echoResponse.length !== packet.length) {
              throw new Error(
                `Echo length mismatch (expected ${packet.length}, got ${echoResponse ? echoResponse.length : 0})`
              );
            }
            for (let i = 0; i < packet.length; i++) {
              if (packet[i] !== echoResponse[i]) {
                throw new Error("Echo mismatch detected");
              }
            }
            logger.debug("Echo verified successfully", { slaveId, funcCode });
          }
          if (ignoreNoResponse) {
            const elapsed2 = Date.now() - startTime;
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordSuccess(elapsed2, slaveId, funcCode);
            }
            logger.info("Request sent, no response expected", {
              slaveId,
              funcCode,
              responseTime: elapsed2
            });
            return void 0;
          }
          const response = await this._readPacket(timeLeft, pdu);
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordDataReceived(response.length, slaveId, funcCode);
          }
          const elapsed = Date.now() - startTime;
          const { slaveAddress, pdu: responsePdu } = (0, import_packet_builder.parsePacket)(response, this.crcFunc);
          if (slaveAddress !== slaveId) {
            throw new Error(`Slave address mismatch (expected ${slaveId}, got ${slaveAddress})`);
          }
          const responseFuncCode = responsePdu[0];
          if ((responseFuncCode & 128) !== 0) {
            const exceptionCode = responsePdu[1];
            const modbusExceptionCode = ModbusClient.EXCEPTION_CODE_MAP.get(exceptionCode) ?? exceptionCode;
            const exceptionMessage = import_constants.MODBUS_EXCEPTION_MESSAGES[exceptionCode] ?? `Unknown exception code: ${exceptionCode}`;
            logger.warn("Modbus exception received", {
              slaveId,
              funcCode,
              exceptionCode,
              exceptionMessage,
              responseTime: elapsed
            });
            throw new import_errors.ModbusExceptionError(responseFuncCode & 127, modbusExceptionCode);
          }
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
          }
          logger.info("Response received", {
            slaveId,
            funcCode,
            responseTime: elapsed
          });
          return responsePdu;
        } catch (err) {
          const elapsed = Date.now() - startTime;
          const isFlushedError = err instanceof import_errors.ModbusFlushError;
          const errorCode = err instanceof Error && err.message.toLowerCase().includes("timeout") ? "timeout" : err instanceof Error && err.message.toLowerCase().includes("crc") ? "crc" : err instanceof import_errors.ModbusExceptionError ? "modbus-exception" : null;
          if (this.diagnosticsEnabled) {
            this.diagnostics.recordError(err instanceof Error ? err : new Error(String(err)), {
              code: errorCode,
              responseTimeMs: elapsed,
              slaveId,
              funcCode,
              exceptionCode: err instanceof import_errors.ModbusExceptionError ? err.exceptionCode : null
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
              exceptionCode: err instanceof import_errors.ModbusExceptionError ? err.exceptionCode : null
            }
          );
          lastError = err;
          if (isFlushedError) {
            logger.info(`Attempt #${attempt + 1} failed due to flush, will retry`, {
              slaveId,
              funcCode
            });
          }
          if (ignoreNoResponse && err instanceof Error && err.message.toLowerCase().includes("timeout") || isFlushedError) {
            logger.info("Operation ignored due to ignoreNoResponse=true and timeout/flush", {
              slaveId,
              funcCode,
              responseTime: elapsed
            });
            if (this.diagnosticsEnabled) {
              this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            }
            return void 0;
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
                funcCode
              });
            } else {
              logger.debug(`Retrying after delay ${delay}ms`, { slaveId, funcCode });
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            logger.error(`All ${this.retryCount + 1} attempts exhausted`, {
              error: lastError,
              slaveId,
              funcCode,
              responseTime: elapsed
            });
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
          }
        }
      }
      throw new Error("Unexpected end of _sendRequest function");
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
  _convertRegisters(registers, type = import_constants.RegisterType.UINT16) {
    if (!registers || !Array.isArray(registers)) {
      throw new Error("Invalid registers: must be a non-empty array");
    }
    const buffer = new ArrayBuffer(registers.length * 2);
    const view = new DataView(buffer);
    registers.forEach((reg, i) => {
      view.setUint16(i * 2, reg, false);
    });
    const read32 = (method, littleEndian = false) => {
      const result = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        result.push(view[method](i * 2, littleEndian));
      }
      return result;
    };
    const read64 = (method, littleEndian = false) => {
      if (method === "getFloat64") {
        const result2 = [];
        for (let i = 0; i < registers.length - 3; i += 4) {
          const tempBuf = new ArrayBuffer(8);
          const tempView = new DataView(tempBuf);
          for (let j = 0; j < 8; j++) {
            tempView.setUint8(j, view.getUint8(i * 2 + j));
          }
          result2.push(tempView.getFloat64(0, littleEndian));
        }
        return result2;
      }
      const result = [];
      for (let i = 0; i < registers.length - 3; i += 4) {
        const tempBuf = new ArrayBuffer(8);
        const tempView = new DataView(tempBuf);
        for (let j = 0; j < 8; j++) {
          tempView.setUint8(j, view.getUint8(i * 2 + j));
        }
        const high = BigInt(tempView.getUint32(0, littleEndian));
        const low = BigInt(tempView.getUint32(4, littleEndian));
        let value = high << 32n | low;
        if (method === "getInt64" && value & 1n << 63n) {
          value -= 1n << 64n;
        }
        result.push(value);
      }
      return result;
    };
    const getSwapped32 = (i, mode) => {
      const a = view.getUint8(i * 2);
      const b = view.getUint8(i * 2 + 1);
      const c = view.getUint8(i * 2 + 2);
      const d = view.getUint8(i * 2 + 3);
      let bytes;
      switch (mode) {
        case "sw":
          bytes = [c, d, a, b];
          break;
        case "sb":
          bytes = [b, a, d, c];
          break;
        case "sbw":
          bytes = [d, c, b, a];
          break;
        case "le":
          bytes = [d, c, b, a];
          break;
        case "le_sw":
          bytes = [b, a, d, c];
          break;
        case "le_sb":
          bytes = [a, b, c, d];
          break;
        case "le_sbw":
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
    const read32Swapped = (method, mode) => {
      const result = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        const tempView = getSwapped32(i, mode);
        result.push(tempView[method](0, false));
      }
      return result;
    };
    switch (type) {
      case import_constants.RegisterType.UINT16:
        return registers;
      case import_constants.RegisterType.INT16:
        return registers.map((_, i) => view.getInt16(i * 2, false));
      case import_constants.RegisterType.UINT32:
        return read32("getUint32");
      case import_constants.RegisterType.INT32:
        return read32("getInt32");
      case import_constants.RegisterType.FLOAT:
        return read32("getFloat32");
      case import_constants.RegisterType.UINT32_LE:
        return read32("getUint32", true);
      case import_constants.RegisterType.INT32_LE:
        return read32("getInt32", true);
      case import_constants.RegisterType.FLOAT_LE:
        return read32("getFloat32", true);
      case import_constants.RegisterType.UINT32_SW:
        return read32Swapped("getUint32", "sw");
      case import_constants.RegisterType.INT32_SW:
        return read32Swapped("getInt32", "sw");
      case import_constants.RegisterType.FLOAT_SW:
        return read32Swapped("getFloat32", "sw");
      case import_constants.RegisterType.UINT32_SB:
        return read32Swapped("getUint32", "sb");
      case import_constants.RegisterType.INT32_SB:
        return read32Swapped("getInt32", "sb");
      case import_constants.RegisterType.FLOAT_SB:
        return read32Swapped("getFloat32", "sb");
      case import_constants.RegisterType.UINT32_SBW:
        return read32Swapped("getUint32", "sbw");
      case import_constants.RegisterType.INT32_SBW:
        return read32Swapped("getInt32", "sbw");
      case import_constants.RegisterType.FLOAT_SBW:
        return read32Swapped("getFloat32", "sbw");
      case import_constants.RegisterType.UINT32_LE_SW:
        return read32Swapped("getUint32", "le_sw");
      case import_constants.RegisterType.INT32_LE_SW:
        return read32Swapped("getInt32", "le_sw");
      case import_constants.RegisterType.FLOAT_LE_SW:
        return read32Swapped("getFloat32", "le_sw");
      case import_constants.RegisterType.UINT32_LE_SB:
        return read32Swapped("getUint32", "le_sb");
      case import_constants.RegisterType.INT32_LE_SB:
        return read32Swapped("getInt32", "le_sb");
      case import_constants.RegisterType.FLOAT_LE_SB:
        return read32Swapped("getFloat32", "le_sb");
      case import_constants.RegisterType.UINT32_LE_SBW:
        return read32Swapped("getUint32", "le_sbw");
      case import_constants.RegisterType.INT32_LE_SBW:
        return read32Swapped("getInt32", "le_sbw");
      case import_constants.RegisterType.FLOAT_LE_SBW:
        return read32Swapped("getFloat32", "le_sbw");
      case import_constants.RegisterType.UINT64:
        return read64("getUint64");
      case import_constants.RegisterType.INT64:
        return read64("getInt64");
      case import_constants.RegisterType.DOUBLE:
        return read64("getFloat64");
      case import_constants.RegisterType.UINT64_LE:
        return read64("getUint64", true);
      case import_constants.RegisterType.INT64_LE:
        return read64("getInt64", true);
      case import_constants.RegisterType.DOUBLE_LE:
        return read64("getFloat64", true);
      case import_constants.RegisterType.HEX:
        return registers.map(
          (r) => r.toString(16).toUpperCase().padStart(4, "0")
        );
      case import_constants.RegisterType.STRING: {
        let str = "";
        for (let i = 0; i < registers.length; i++) {
          const high = registers[i] >> 8 & 255;
          const low = registers[i] & 255;
          if (high !== 0) str += String.fromCharCode(high);
          if (low !== 0) str += String.fromCharCode(low);
        }
        return [str];
      }
      case import_constants.RegisterType.BOOL:
        return registers.map((r) => r !== 0);
      case import_constants.RegisterType.BINARY:
        return registers.map(
          (r) => r.toString(2).padStart(16, "0").split("").map((b) => b === "1")
        );
      case import_constants.RegisterType.BCD:
        return registers.map((r) => {
          const high = r >> 8 & 255;
          const low = r & 255;
          return ((high >> 4) * 10 + (high & 15)) * 100 + (low >> 4) * 10 + (low & 15);
        });
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }
  /**
   * Reads holding registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125 for Modbus standard).
   * @param options - The options for the read operation.
   * @returns The converted registers.
   */
  async readHoldingRegisters(startAddress, quantity, options = {}) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new Error("Invalid quantity: must be an integer between 1 and 125");
    }
    const pdu = (0, import_read_holding_registers.buildReadHoldingRegistersRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    const registers = (0, import_read_holding_registers.parseReadHoldingRegistersResponse)(responsePdu);
    const type = options.type ?? import_constants.RegisterType.UINT16;
    return this._convertRegisters(registers, type);
  }
  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read (0–65535).
   * @param quantity - The number of registers to read (1–125 for Modbus standard).
   * @param options - The options for the read operation.
   * @returns The converted registers.
   */
  async readInputRegisters(startAddress, quantity, options = {}) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new Error("Invalid quantity: must be an integer between 1 and 125");
    }
    const pdu = (0, import_read_input_registers.buildReadInputRegistersRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    const registers = (0, import_read_input_registers.parseReadInputRegistersResponse)(responsePdu);
    const type = options.type ?? import_constants.RegisterType.UINT16;
    return this._convertRegisters(registers, type);
  }
  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write (0–65535).
   * @param value - The value to write to the register (0–65535).
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleRegister(address, value, timeout) {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new Error("Invalid address: must be an integer between 0 and 65535");
    }
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new Error("Invalid value: must be an integer between 0 and 65535");
    }
    const pdu = (0, import_write_single_register.buildWriteSingleRegisterRequest)(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_single_register.parseWriteSingleRegisterResponse)(responsePdu);
  }
  /**
   * Writes multiple registers to the Modbus device.
   * @param startAddress - The starting address of the registers to write (0–65535).
   * @param values - The values to write to the registers (each 0–65535).
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleRegisters(startAddress, values, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 123) {
      throw new Error("Invalid values: must be an array of 1 to 123 integers");
    }
    if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 65535)) {
      throw new Error("Invalid values: each value must be an integer between 0 and 65535");
    }
    const pdu = (0, import_write_multiple_registers.buildWriteMultipleRegistersRequest)(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_multiple_registers.parseWriteMultipleRegistersResponse)(responsePdu);
  }
  /**
   * Reads coils from the Modbus device.
   * @param startAddress - The starting address of the coils to read (0–65535).
   * @param quantity - The number of coils to read (1–2000 for Modbus standard).
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readCoils(startAddress, quantity, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2e3) {
      throw new Error("Invalid quantity: must be an integer between 1 and 2000");
    }
    const pdu = (0, import_read_coils.buildReadCoilsRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_read_coils.parseReadCoilsResponse)(responsePdu);
  }
  /**
   * Reads discrete inputs from the Modbus device.
   * @param startAddress - The starting address of the discrete inputs to read (0–65535).
   * @param quantity - The number of discrete inputs to read (1–2000 for Modbus standard).
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readDiscreteInputs(startAddress, quantity, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2e3) {
      throw new Error("Invalid quantity: must be an integer between 1 and 2000");
    }
    const pdu = (0, import_read_discrete_inputs.buildReadDiscreteInputsRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_read_discrete_inputs.parseReadDiscreteInputsResponse)(responsePdu);
  }
  /**
   * Writes a single coil to the Modbus device.
   * @param address - The address of the coil to write (0–65535).
   * @param value - The value to write to the coil (boolean or 0/1).
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleCoil(address, value, timeout) {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new Error("Invalid address: must be an integer between 0 and 65535");
    }
    if (typeof value === "number" && value !== 0 && value !== 1) {
      throw new Error("Invalid value: must be a boolean or 0/1");
    }
    const pdu = (0, import_write_single_coil.buildWriteSingleCoilRequest)(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_single_coil.parseWriteSingleCoilResponse)(responsePdu);
  }
  /**
   * Writes multiple coils to the Modbus device.
   * @param startAddress - The starting address of the coils to write (0–65535).
   * @param values - The values to write to the coils.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleCoils(startAddress, values, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new Error("Invalid startAddress: must be an integer between 0 and 65535");
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 1968) {
      throw new Error("Invalid values: must be an array of 1 to 1968 booleans");
    }
    const pdu = (0, import_write_multiple_coils.buildWriteMultipleCoilsRequest)(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_multiple_coils.parseWriteMultipleCoilsResponse)(responsePdu);
  }
  /**
   * Reports the slave ID of the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async reportSlaveId(timeout) {
    const pdu = (0, import_report_slave_id.buildReportSlaveIdRequest)();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_report_slave_id.parseReportSlaveIdResponse)(responsePdu);
  }
  /**
   * Reads the device identification from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readDeviceIdentification(timeout) {
    const originalSlaveId = this.slaveId;
    try {
      const pdu = (0, import_read_device_identification.buildReadDeviceIdentificationRequest)();
      const responsePdu = await this._sendRequest(pdu, timeout);
      if (!responsePdu) {
        throw new Error("No response received");
      }
      return (0, import_read_device_identification.parseReadDeviceIdentificationResponse)(responsePdu);
    } finally {
      this.slaveId = originalSlaveId;
    }
  }
  /**
   * Reads the file length from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readFileLength(timeout) {
    const pdu = (0, import_read_file_length.buildReadFileLengthRequest)("");
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_read_file_length.parseReadFileLengthResponse)(responsePdu);
  }
  /**
   * Opens a file on the Modbus device.
   * @param filename - The name of the file to open.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async openFile(filename, timeout) {
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error("Invalid filename: must be a non-empty string");
    }
    const pdu = (0, import_openFile.buildOpenFileRequest)(filename);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_openFile.parseOpenFileResponse)(responsePdu);
  }
  /**
   * Closes a file on the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async closeFile(timeout) {
    const pdu = (0, import_closeFile.buildCloseFileRequest)();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    if (responsePdu === void 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (this.transport.flush) {
        await this.transport.flush();
      }
      return true;
    }
    const result = (0, import_closeFile.parseCloseFileResponse)(responsePdu);
    await new Promise((resolve) => setTimeout(resolve, 100));
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
  async restartController(timeout) {
    const pdu = (0, import_restart_controller.buildRestartControllerRequest)();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    if (responsePdu === void 0) {
      return { success: true };
    }
    return (0, import_restart_controller.parseRestartControllerResponse)(responsePdu);
  }
  /**
   * Gets the controller time from the Modbus device.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async getControllerTime(timeout) {
    const pdu = (0, import_get_controller_time.buildGetControllerTimeRequest)();
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_get_controller_time.parseGetControllerTimeResponse)(responsePdu);
  }
  /**
   * Sets the controller time on the Modbus device.
   * @param datetime - The datetime to set on the controller.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async setControllerTime(datetime, timeout) {
    if (!(datetime instanceof Date) || isNaN(datetime.getTime())) {
      throw new Error("Invalid datetime: must be a valid Date object");
    }
    const time = {
      seconds: datetime.getSeconds(),
      minutes: datetime.getMinutes(),
      hours: datetime.getHours(),
      day: datetime.getDate(),
      month: datetime.getMonth() + 1,
      year: datetime.getFullYear()
    };
    const pdu = (0, import_set_controller_time.buildSetControllerTimeRequest)(time);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_set_controller_time.parseSetControllerTimeResponse)(responsePdu);
  }
}
module.exports = ModbusClient;
