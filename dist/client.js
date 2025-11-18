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
var import_errors = require("./errors.js");
var import_constants = require("./constants/constants.js");
var import_packet_builder = require("./packet-builder.js");
var import_logger = __toESM(require("./logger.js"));
var import_crc = require("./utils/crc.js");
var import_modbus_types = require("./types/modbus-types.js");
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
  transportController;
  slaveId;
  options;
  rsMode;
  defaultTimeout;
  retryCount;
  retryDelay;
  echoEnabled;
  crcFunc;
  _mutex;
  _plugins = [];
  _customFunctions = /* @__PURE__ */ new Map();
  _customRegisterTypes = /* @__PURE__ */ new Map();
  _customCrcAlgorithms = /* @__PURE__ */ new Map();
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
  constructor(transportController, slaveId = 1, options = {}) {
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 255) {
      throw new import_errors.ModbusInvalidAddressError(slaveId);
    }
    this.transportController = transportController;
    this.slaveId = slaveId;
    this.options = options;
    this.rsMode = options.RSMode ?? "RS485";
    this.defaultTimeout = options.timeout ?? 2e3;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;
    this.echoEnabled = options.echoEnabled ?? false;
    const algorithm = options.crcAlgorithm ?? "crc16Modbus";
    const crcFunc = crcAlgorithmMap[algorithm];
    if (!crcFunc) {
      throw new import_errors.ModbusConfigError(`Unknown CRC algorithm: ${algorithm}`);
    }
    this.crcFunc = crcFunc;
    this._mutex = new import_async_mutex.Mutex();
    this._setAutoLoggerContext();
    if (options.plugins && Array.isArray(options.plugins)) {
      for (const PluginClass of options.plugins) {
        this.use(new PluginClass());
      }
    }
    this._resolveCrcFunction(options.crcAlgorithm ?? "crc16Modbus");
  }
  /**
   * Returns the effective transport for the client
   */
  get _effectiveTransport() {
    return this.transportController.getTransportForSlave(this.slaveId, this.rsMode);
  }
  /**
   * Enables the ModbusClient logger
   * @param level - Logging level
   */
  enableLogger(level = "info") {
    logger.setLevel(level);
  }
  /**
   * Disables the ModbusClient logger (sets the highest level - error)
   */
  disableLogger() {
    logger.setLevel("error");
  }
  /**
   * Sets the context for the logger (slaveId, functionCode, etc.)
   * @param context - Context for the logger
   */
  setLoggerContext(context) {
    logger.addGlobalContext(context);
  }
  /**
   * Sets the logger context automatically based on the current settings.
   */
  _setAutoLoggerContext(funcCode) {
    const transport = this._effectiveTransport;
    const transportName = transport ? transport.constructor.name : "Unknown";
    const context = {
      slaveId: this.slaveId,
      transport: transportName
    };
    if (funcCode !== void 0) {
      context.funcCode = funcCode;
    }
    logger.addGlobalContext(context);
  }
  /**
   * Registers a plugin with the ModbusClient.
   * @param plugin - The plugin to register.
   */
  use(plugin) {
    if (!plugin || typeof plugin.name !== "string") {
      throw new Error(
        'Invalid plugin provided. A plugin must be an object with a "name" property.'
      );
    }
    if (this._plugins.some((p) => p.name === plugin.name)) {
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
        const isBuiltIn = Object.values(import_constants.RegisterType).includes(typeName);
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
      const currentCrcName = this.options.crcAlgorithm ?? "crc16Modbus";
      if (plugin.customCrcAlgorithms[currentCrcName]) {
        this._resolveCrcFunction(currentCrcName);
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
  async executeCustomFunction(functionName, ...args) {
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
   * Resolves the CRC function based on the provided algorithm.
   * @param algorithm - The CRC algorithm to resolve.
   */
  _resolveCrcFunction(algorithm) {
    const customFunc = this._customCrcAlgorithms.get(algorithm);
    const builtInFunc = crcAlgorithmMap[algorithm];
    if (customFunc) {
      this.crcFunc = customFunc;
      logger.debug(`Using custom CRC algorithm "${algorithm}" from a plugin.`);
    } else if (builtInFunc) {
      this.crcFunc = builtInFunc;
    } else {
      throw new import_errors.ModbusConfigError(`Unknown CRC algorithm: ${algorithm}`);
    }
  }
  /**
   * Performs a logical connection check to ensure the client is ready for communication.
   * This method verifies that a transport is available and has been connected by the TransportController.
   * It does NOT initiate the physical connection itself.
   * Throws ModbusNotConnectedError if the transport is not ready.
   */
  async connect() {
    const release = await this._mutex.acquire();
    try {
      const transport = this._effectiveTransport;
      if (!transport) {
        throw new import_errors.ModbusNotConnectedError();
      }
      if (!transport.isOpen) {
        throw new import_errors.ModbusNotConnectedError();
      }
      this._setAutoLoggerContext();
      logger.info("Client is ready. Transport is connected and available.", {
        slaveId: this.slaveId,
        transport: transport.constructor.name
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
  async disconnect() {
    const release = await this._mutex.acquire();
    try {
      const transport = this._effectiveTransport;
      this._setAutoLoggerContext();
      logger.info(
        "Client logically disconnected. The physical transport connection is not affected.",
        {
          slaveId: this.slaveId,
          transport: transport ? transport.constructor.name : "N/A"
        }
      );
    } finally {
      release();
    }
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
        if (bitCount < 1 || bitCount > 2e3) {
          throw new import_errors.ModbusInvalidQuantityError(bitCount, 1, 2e3);
        }
        return 5 + Math.ceil(bitCount / 8);
      }
      case import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS:
      case import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS: {
        if (pdu.length < 5) return null;
        const regCount = pdu[3] << 8 | pdu[4];
        if (regCount < 1 || regCount > 125) {
          throw new import_errors.ModbusInvalidQuantityError(regCount, 1, 125);
        }
        return 5 + regCount * 2;
      }
      case import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL:
      case import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER:
        return 8;
      case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS:
      case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
        return 8;
      case import_constants.ModbusFunctionCode.READ_DEVICE_COMMENT:
        return null;
      case import_constants.ModbusFunctionCode.WRITE_DEVICE_COMMENT:
        return 5;
      case import_constants.ModbusFunctionCode.READ_DEVICE_IDENTIFICATION: {
        if (pdu.length < 4) return null;
        if (pdu[2] === 0) return 6;
        if (pdu[2] === 4) return null;
        return null;
      }
      case import_constants.ModbusFunctionCode.READ_FILE_LENGTH:
        return 8;
      case import_constants.ModbusFunctionCode.OPEN_FILE:
        return 8;
      case import_constants.ModbusFunctionCode.CLOSE_FILE:
        return 5;
      case import_constants.ModbusFunctionCode.RESTART_CONTROLLER:
        return 0;
      case import_constants.ModbusFunctionCode.GET_CONTROLLER_TIME:
        return 10;
      case import_constants.ModbusFunctionCode.SET_CONTROLLER_TIME:
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
  async _readPacket(timeout, requestPdu = null) {
    const start = Date.now();
    let buffer = new Uint8Array(0);
    const expectedLength = requestPdu ? this._getExpectedResponseLength(requestPdu) : null;
    while (true) {
      const timeLeft = timeout - (Date.now() - start);
      if (timeLeft <= 0) throw new import_errors.ModbusTimeoutError("Read timeout");
      const minPacketLength = 5;
      const bytesToRead = expectedLength ? Math.max(1, expectedLength - buffer.length) : Math.max(1, minPacketLength - buffer.length);
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
      const funcCode = requestPdu ? requestPdu[0] : void 0;
      this._setAutoLoggerContext(funcCode);
      logger.debug("Received chunk:", { bytes: chunk.length, total: buffer.length });
      if (buffer.length >= minPacketLength) {
        try {
          (0, import_packet_builder.parsePacket)(buffer, this.crcFunc);
          return buffer;
        } catch (err) {
          if (err instanceof import_errors.ModbusCRCError) {
            logger.error("CRC mismatch detected");
            continue;
          } else if (err instanceof import_errors.ModbusFramingError) {
            logger.error("Framing error detected");
            continue;
          } else if (err instanceof import_errors.ModbusParityError) {
            logger.error("Parity error detected");
            continue;
          } else if (err instanceof import_errors.ModbusNoiseError) {
            logger.error("Noise error detected");
            continue;
          } else if (err instanceof import_errors.ModbusOverrunError) {
            logger.error("Overrun error detected");
            continue;
          } else if (err instanceof import_errors.ModbusCollisionError) {
            logger.error("Collision error detected");
            continue;
          } else if (err instanceof import_errors.ModbusSyncError) {
            logger.error("Sync error detected");
            continue;
          } else if (err instanceof import_errors.ModbusFrameBoundaryError) {
            logger.error("Frame boundary error detected");
            continue;
          } else if (err instanceof import_errors.ModbusLRCError) {
            logger.error("LRC error detected");
            continue;
          } else if (err instanceof import_errors.ModbusChecksumError) {
            logger.error("Checksum error detected");
            continue;
          } else if (err instanceof import_errors.ModbusMalformedFrameError) {
            logger.error("Malformed frame error detected");
            continue;
          } else if (err instanceof import_errors.ModbusInvalidFrameLengthError) {
            logger.error("Invalid frame length error detected");
            continue;
          } else if (err instanceof import_errors.ModbusInvalidTransactionIdError) {
            logger.error("Invalid transaction ID error detected");
            continue;
          } else if (err instanceof import_errors.ModbusUnexpectedFunctionCodeError) {
            logger.error("Unexpected function code error detected");
            continue;
          } else if (err instanceof import_errors.ModbusTooManyEmptyReadsError) {
            logger.error("Too many empty reads error detected");
            continue;
          } else if (err instanceof import_errors.ModbusInterFrameTimeoutError) {
            logger.error("Inter-frame timeout error detected");
            continue;
          } else if (err instanceof import_errors.ModbusSilentIntervalError) {
            logger.error("Silent interval error detected");
            continue;
          } else if (err instanceof import_errors.ModbusResponseError) {
            logger.error("Response error detected");
            continue;
          } else if (err instanceof import_errors.ModbusBufferOverflowError) {
            logger.error("Buffer overflow error detected");
            continue;
          } else if (err instanceof import_errors.ModbusBufferUnderrunError) {
            logger.error("Buffer underrun error detected");
            continue;
          } else if (err instanceof import_errors.ModbusMemoryError) {
            logger.error("Memory error detected");
            continue;
          } else if (err instanceof import_errors.ModbusStackOverflowError) {
            logger.error("Stack overflow error detected");
            continue;
          } else if (err instanceof import_errors.ModbusInsufficientDataError) {
            logger.error("Insufficient data error detected");
            continue;
          } else if (err instanceof Error && err.message.startsWith("Invalid packet: too short")) {
            continue;
          } else if (err instanceof Error && err.message.startsWith("CRC mismatch")) {
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
  async _sendRequest(pdu, timeout = this.defaultTimeout, ignoreNoResponse = false) {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0];
      const funcCodeEnum = ModbusClient.FUNCTION_CODE_MAP.get(funcCode) ?? funcCode;
      const slaveId = this.slaveId;
      let lastError;
      const startTime = Date.now();
      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        const transport = this._effectiveTransport;
        if (!transport) {
          throw new Error(`No transport available for slaveId ${this.slaveId}`);
        }
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
          await transport.write(packet);
          logger.debug("Packet written to transport", { bytes: packet.length, slaveId, funcCode });
          if (this.echoEnabled) {
            logger.debug("Echo enabled, reading echo back...", { slaveId, funcCode });
            const echoResponse = await transport.read(packet.length, timeLeft);
            if (!echoResponse || echoResponse.length !== packet.length) {
              throw new import_errors.ModbusInsufficientDataError(
                echoResponse ? echoResponse.length : 0,
                packet.length
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
            logger.info("Request sent, no response expected", {
              slaveId,
              funcCode,
              responseTime: elapsed2
            });
            return void 0;
          }
          const response = await this._readPacket(timeLeft, pdu);
          const elapsed = Date.now() - startTime;
          const { slaveAddress, pdu: responsePdu } = (0, import_packet_builder.parsePacket)(response, this.crcFunc);
          if (slaveAddress !== slaveId) {
            throw new Error(`Slave address mismatch (expected ${slaveId}, got ${slaveAddress})`);
          }
          if (transport.notifyDeviceConnected) {
            transport.notifyDeviceConnected(slaveId);
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
          logger.info("Response received", {
            slaveId,
            funcCode,
            responseTime: elapsed
          });
          return responsePdu;
        } catch (err) {
          const elapsed = Date.now() - startTime;
          if (!(err instanceof import_errors.ModbusExceptionError)) {
            if (transport.notifyDeviceDisconnected) {
              let errorType = import_modbus_types.ConnectionErrorType.UnknownError;
              if (err instanceof import_errors.ModbusTimeoutError) {
                errorType = import_modbus_types.ConnectionErrorType.Timeout;
              } else if (err instanceof import_errors.ModbusCRCError) {
                errorType = import_modbus_types.ConnectionErrorType.CRCError;
              }
              const errorMessage = err instanceof Error ? err.message : String(err);
              transport.notifyDeviceDisconnected(slaveId, errorType, errorMessage);
            }
          }
          const isFlushedError = err instanceof import_errors.ModbusFlushError;
          const errorCode = err instanceof Error && err.message.toLowerCase().includes("timeout") ? "timeout" : err instanceof Error && err.message.toLowerCase().includes("crc") ? "crc" : err instanceof import_errors.ModbusExceptionError ? "modbus-exception" : null;
          if (transport.flush) {
            try {
              await transport.flush();
              logger.debug("Transport flushed after error", { slaveId });
            } catch (flushErr) {
              logger.warn("Failed to flush transport after error", {
                slaveId,
                flushError: flushErr
              });
            }
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
              errorCode,
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
            return void 0;
          }
          if (attempt < this.retryCount) {
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
            if (transport.flush) {
              try {
                await transport.flush();
                logger.debug("Final transport flush after all retries failed", { slaveId });
              } catch (flushErr) {
                logger.warn("Failed to final flush transport", { slaveId, flushError: flushErr });
              }
            }
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
      throw new import_errors.ModbusDataConversionError(registers, "non-empty array");
    }
    const customTypeHandler = this._customRegisterTypes.get(type);
    if (customTypeHandler) {
      return customTypeHandler(registers);
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
        throw new import_errors.ModbusDataConversionError(type, "a supported built-in or custom register type");
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
  async readHoldingRegisters(startAddress, quantity, options = {}) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new import_errors.ModbusInvalidQuantityError(quantity, 1, 125);
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
   * @param startAddress - The starting address of the registers to read.
   * @param quantity - The number of registers to read.
   * @param options - Optional options for the conversion.
   * @returns The converted registers.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  async readInputRegisters(startAddress, quantity, options = {}) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new import_errors.ModbusInvalidQuantityError(quantity, 1, 125);
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
   * @param address - The address of the register to write.
   * @param value - The value to write to the register.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the address is invalid.
   * @throws ModbusIllegalDataValueError If the value is invalid.
   */
  async writeSingleRegister(address, value, timeout) {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new import_errors.ModbusInvalidAddressError(address);
    }
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new import_errors.ModbusIllegalDataValueError(value, "integer between 0 and 65535");
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
   * @param startAddress - The starting address of the registers to write.
   * @param values - The values to write to the registers.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   * @throws ModbusIllegalDataValueError If any of the values are invalid.
   */
  async writeMultipleRegisters(startAddress, values, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 123) {
      throw new import_errors.ModbusInvalidQuantityError(values.length, 1, 123);
    }
    if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 65535)) {
      const invalidValue = values.find((v) => !Number.isInteger(v) || v < 0 || v > 65535);
      throw new import_errors.ModbusIllegalDataValueError(invalidValue, "integer between 0 and 65535");
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
   * @param startAddress - The starting address of the coils to read.
   * @param quantity - The number of coils to read.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  async readCoils(startAddress, quantity, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2e3) {
      throw new import_errors.ModbusInvalidQuantityError(quantity, 1, 2e3);
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
   * @param startAddress - The starting address of the discrete inputs to read.
   * @param quantity - The number of discrete inputs to read.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   */
  async readDiscreteInputs(startAddress, quantity, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2e3) {
      throw new import_errors.ModbusInvalidQuantityError(quantity, 1, 2e3);
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
   * @param address - The address of the coil to write.
   * @param value - The value to write to the coil (boolean or 0/1).
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the address is invalid.
   * @throws ModbusIllegalDataValueError If the value is invalid.
   */
  async writeSingleCoil(address, value, timeout) {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new import_errors.ModbusInvalidAddressError(address);
    }
    if (typeof value === "number" && value !== 0 && value !== 1) {
      throw new import_errors.ModbusIllegalDataValueError(value, "boolean or 0/1");
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
   * @param startAddress - The starting address of the coils to write.
   * @param values - The values to write to the coils (array of booleans or 0/1).
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
   * @throws ModbusInvalidAddressError If the start address is invalid.
   * @throws ModbusInvalidQuantityError If the quantity is invalid.
   * @throws ModbusIllegalDataValueError If any of the values are invalid.
   */
  async writeMultipleCoils(startAddress, values, timeout) {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new import_errors.ModbusInvalidAddressError(startAddress);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 1968) {
      throw new import_errors.ModbusInvalidQuantityError(values.length, 1, 1968);
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
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
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
   * Reads device identification from the Modbus device.
   * @param timeout - Optional timeout for the request.
   * @returns The response from the device.
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
}
module.exports = ModbusClient;
