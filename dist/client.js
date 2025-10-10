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
  constructor(transport, slaveId = 1, options = {}) {
    if (slaveId < 1 || slaveId > 255) {
      throw new Error("Invalid slave ID. Must be a number between 1 and 255");
    }
    this.transport = transport;
    this.slaveId = slaveId;
    this.defaultTimeout = options.timeout || 2e3;
    this.retryCount = options.retryCount || 0;
    this.retryDelay = options.retryDelay || 100;
    this.echoEnabled = options.echoEnabled || false;
    this.diagnosticsEnabled = !!options.diagnostics;
    this.diagnostics = this.diagnosticsEnabled ? new import_diagnostics.Diagnostics({ loggerName: "ModbusClient" }) : new import_diagnostics.Diagnostics({ loggerName: "Noop" });
    this.crcFunc = crcAlgorithmMap[options.crcAlgorithm || "crc16Modbus"];
    if (!this.crcFunc) throw new Error(`Unknown CRC algorithm: ${options.crcAlgorithm}`);
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
    if (typeof slaveId !== "number" || slaveId < 1 || slaveId > 255) {
      throw new Error("Invalid slave ID. Must be a number between 1 and 255");
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
    switch (funcCode) {
      // Standard Modbus functions
      case 1:
      // Read Coils
      case 2: {
        if (pdu.length < 5) return null;
        const bitCount = pdu[3] << 8 | pdu[4];
        return 5 + Math.ceil(bitCount / 8);
      }
      case 3:
      // Read Holding Registers
      case 4: {
        if (pdu.length < 5) return null;
        const regCount = pdu[3] << 8 | pdu[4];
        return 5 + regCount * 2;
      }
      case 5:
      // Write Single Coil
      case 6:
        return 8;
      // slave(1) + func(1) + address(2) + value(2) + CRC(2)
      case 15:
      // Write Multiple Coils
      case 16:
        return 8;
      // slave(1) + func(1) + address(2) + quantity(2) + CRC(2)
      case 8:
        return 8;
      // slave(1) + func(1) + subFunc(2) + data(2) + CRC(2)
      // Special functions for SGM130
      case 20:
        return null;
      case 21:
        return 5;
      // slave(1) + func(1) + channel(1) + length(1) + CRC(2)
      case 43: {
        if (pdu.length < 4) return null;
        if (pdu[2] === 0) return 6;
        if (pdu[2] === 4) {
          return null;
        }
        return null;
      }
      case 82:
        return 8;
      // slave(1) + func(1) + length(4) + CRC(2)
      case 85:
        return 8;
      // slave(1) + func(1) + length(4) + CRC(2)
      case 87:
        return 5;
      // slave(1) + func(1) + status(1) + CRC(2)
      case 92:
        return 0;
      // Ответа не ожидается
      case 110:
        return 10;
      // slave(1) + func(1) + time(6) + CRC(2)
      case 111:
        return 8;
      // slave(1) + func(1) + status(2) + CRC(2)
      // Обработка ошибок
      default:
        if (funcCode & 128) {
          return 5;
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
      this._setAutoLoggerContext(requestPdu ? requestPdu[0] : null);
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
   * @returns The received packet.
   * @throws ModbusTimeoutError If the send operation times out.
   */
  async _sendRequest(pdu, timeout = this.defaultTimeout, ignoreNoResponse = false) {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0];
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
          this._setAutoLoggerContext(funcCode);
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
            throw new import_errors.ModbusExceptionError(responseFuncCode & 127, exceptionCode);
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
          this._setAutoLoggerContext(funcCode);
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
            if (lastError instanceof Error) {
              throw lastError;
            } else {
              throw new Error(String(lastError));
            }
          }
        }
      }
      throw new Error("Unexpected end of _sendRequest function");
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
  _convertRegisters(registers, type = "uint16") {
    const buffer = new ArrayBuffer(registers.length * 2);
    const view = new DataView(buffer);
    registers.forEach((reg, i) => {
      view.setUint16(i * 2, reg, false);
    });
    const read32 = (method, littleEndian = false) => {
      const result = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        switch (method) {
          case "getUint32":
            result.push(view.getUint32(i * 2, littleEndian));
            break;
          case "getInt32":
            result.push(view.getInt32(i * 2, littleEndian));
            break;
          case "getFloat32":
            result.push(view.getFloat32(i * 2, littleEndian));
            break;
        }
      }
      return result;
    };
    const read64 = (method, littleEndian = false) => {
      if (method === "getDouble") {
        const result = [];
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
        const result = [];
        for (let i = 0; i < registers.length - 3; i += 4) {
          const tempBuf = new ArrayBuffer(8);
          const tempView = new DataView(tempBuf);
          for (let j = 0; j < 8; j++) {
            tempView.setUint8(j, view.getUint8(i * 2 + j));
          }
          if (method === "getUint64") {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            result.push(high << 32n | low);
          } else {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            let value = high << 32n | low;
            if (value & 1n << 63n) value -= 1n << 64n;
            result.push(value);
          }
        }
        return result;
      }
    };
    const getSwapped32 = (i, mode) => {
      const a = view.getUint8(i * 2);
      const b = view.getUint8(i * 2 + 1);
      const c = view.getUint8(i * 2 + 2);
      const d = view.getUint8(i * 2 + 3);
      let bytes = [];
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
        switch (method) {
          case "getUint32":
            result.push(tempView.getUint32(0, false));
            break;
          case "getInt32":
            result.push(tempView.getInt32(0, false));
            break;
          case "getFloat32":
            result.push(tempView.getFloat32(0, false));
            break;
        }
      }
      return result;
    };
    switch (type.toLowerCase()) {
      // 16-бит
      case "uint16":
        return registers;
      case "int16":
        return registers.map((_, i) => view.getInt16(i * 2, false));
      // 32-бит
      case "uint32":
        return read32("getUint32");
      case "int32":
        return read32("getInt32");
      case "float":
        return read32("getFloat32");
      // 32-бит LE
      case "uint32_le":
        return read32("getUint32", true);
      case "int32_le":
        return read32("getInt32", true);
      case "float_le":
        return read32("getFloat32", true);
      // 32-бит со swap
      case "uint32_sw":
        return read32Swapped("getUint32", "sw");
      case "int32_sw":
        return read32Swapped("getInt32", "sw");
      case "float_sw":
        return read32Swapped("getFloat32", "sw");
      case "uint32_sb":
        return read32Swapped("getUint32", "sb");
      case "int32_sb":
        return read32Swapped("getInt32", "sb");
      case "float_sb":
        return read32Swapped("getFloat32", "sb");
      case "uint32_sbw":
        return read32Swapped("getUint32", "sbw");
      case "int32_sbw":
        return read32Swapped("getInt32", "sbw");
      case "float_sbw":
        return read32Swapped("getFloat32", "sbw");
      // 32-бит little-endian через полные swap
      case "uint32_le_sw":
        return read32Swapped("getUint32", "le_sw");
      case "int32_le_sw":
        return read32Swapped("getInt32", "le_sw");
      case "float_le_sw":
        return read32Swapped("getFloat32", "le_sw");
      case "uint32_le_sb":
        return read32Swapped("getUint32", "le_sb");
      case "int32_le_sb":
        return read32Swapped("getInt32", "le_sb");
      case "float_le_sb":
        return read32Swapped("getFloat32", "le_sb");
      case "uint32_le_sbw":
        return read32Swapped("getUint32", "le_sbw");
      case "int32_le_sbw":
        return read32Swapped("getInt32", "le_sbw");
      case "float_le_sbw":
        return read32Swapped("getFloat32", "le_sbw");
      // 64-бит
      case "uint64":
        return read64("getUint64");
      case "int64":
        return read64("getInt64");
      case "double":
        return read64("getDouble");
      // 64-бит LE
      case "uint64_le":
        return read64("getUint64", true);
      case "int64_le":
        return read64("getInt64", true);
      case "double_le":
        return read64("getDouble", true);
      // Разное
      case "hex":
        return registers.map((r) => r.toString(16).toUpperCase().padStart(4, "0"));
      case "string": {
        let str = "";
        for (let i = 0; i < registers.length; i++) {
          const high = registers[i] >> 8 & 255;
          const low = registers[i] & 255;
          if (high !== 0) str += String.fromCharCode(high);
          if (low !== 0) str += String.fromCharCode(low);
        }
        return [str];
      }
      case "bool":
        return registers.map((r) => r !== 0);
      case "binary":
        return registers.map(
          (r) => r.toString(2).padStart(16, "0").split("").map((b) => b === "1")
        );
      case "bcd":
        return registers.map((r) => {
          const high = r >> 8 & 255;
          const low = r & 255;
          return ((high >> 4) * 10 + (high & 15)) * 100 + (low >> 4) * 10 + (low & 15);
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
  async readHoldingRegisters(startAddress, quantity, options = {}) {
    const pdu = (0, import_read_holding_registers.buildReadHoldingRegistersRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    const registers = (0, import_read_holding_registers.parseReadHoldingRegistersResponse)(responsePdu);
    const type = options.type || "uint16";
    return this._convertRegisters(registers, type);
  }
  /**
   * Reads input registers from the Modbus device.
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - The options for the read operation.
   * @returns The buffer containing the read registers.
   */
  async readInputRegisters(startAddress, quantity, options = {}) {
    const responsePdu = await this._sendRequest(
      (0, import_read_input_registers.buildReadInputRegistersRequest)(startAddress, quantity)
    );
    if (!responsePdu) {
      throw new Error("No response received");
    }
    const registers = (0, import_read_input_registers.parseReadInputRegistersResponse)(responsePdu);
    const type = options.type || "uint16";
    return this._convertRegisters(registers, type);
  }
  /**
   * Writes a single register to the Modbus device.
   * @param address - The address of the register to write.
   * @param value - The value to write to the register.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleRegister(address, value, timeout) {
    const pdu = (0, import_write_single_register.buildWriteSingleRegisterRequest)(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_single_register.parseWriteSingleRegisterResponse)(responsePdu);
  }
  /**
   * Writes multiple registers to the Modbus device.
   * @param startAddress - The starting address of the registers to write.
   * @param values - The values to write to the registers.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleRegisters(startAddress, values, timeout) {
    const pdu = (0, import_write_multiple_registers.buildWriteMultipleRegistersRequest)(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_multiple_registers.parseWriteMultipleRegistersResponse)(responsePdu);
  }
  /**
   * Reads coils from the Modbus device.
   * @param startAddress - The starting address of the coils to read.
   * @param quantity - The number of coils to read.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readCoils(startAddress, quantity, timeout) {
    const pdu = (0, import_read_coils.buildReadCoilsRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_read_coils.parseReadCoilsResponse)(responsePdu);
  }
  /**
   * Reads discrete inputs from the Modbus device.
   * @param startAddress - The starting address of the discrete inputs to read.
   * @param quantity - The number of discrete inputs to read.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async readDiscreteInputs(startAddress, quantity, timeout) {
    const pdu = (0, import_read_discrete_inputs.buildReadDiscreteInputsRequest)(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_read_discrete_inputs.parseReadDiscreteInputsResponse)(responsePdu);
  }
  /**
   * Writes a single coil to the Modbus device.
   * @param address - The address of the coil to write.
   * @param value - The value to write to the coil.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeSingleCoil(address, value, timeout) {
    const pdu = (0, import_write_single_coil.buildWriteSingleCoilRequest)(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    if (!responsePdu) {
      throw new Error("No response received");
    }
    return (0, import_write_single_coil.parseWriteSingleCoilResponse)(responsePdu);
  }
  /**
   * Writes multiple coils to the Modbus device.
   * @param startAddress - The starting address of the coils to write.
   * @param values - The values to write to the coils.
   * @param timeout - The timeout in milliseconds.
   * @returns The response from the Modbus device.
   */
  async writeMultipleCoils(startAddress, values, timeout) {
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
      throw new Error("No response received");
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
