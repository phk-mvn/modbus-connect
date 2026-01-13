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
var import_logger = __toESM(require("./logger.js"));
var import_crc = require("./utils/crc.js");
var import_modbus_protocol = require("./framers/modbus-protocol.js");
var import_rtu_framer = require("./framers/rtu-framer.js");
var import_tcp_framer = require("./framers/tcp-framer.js");
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
    this._mutex = new import_async_mutex.Mutex();
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
      const startTime = Date.now();
      let lastError;
      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        const transport = this._effectiveTransport;
        if (!transport) throw new import_errors.ModbusNotConnectedError();
        const framer = this.options.framing === "tcp" ? new import_tcp_framer.TcpFramer() : new import_rtu_framer.RtuFramer(crcAlgorithmMap[this.options.crcAlgorithm ?? "crc16Modbus"]);
        const protocol = new import_modbus_protocol.ModbusProtocol(transport, framer);
        this._setAutoLoggerContext(funcCodeEnum);
        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new import_errors.ModbusTimeoutError("Timeout before request");
          logger.debug(`Attempt #${attempt + 1} \u2014 exchange start`, { slaveId, funcCode });
          if (ignoreNoResponse) {
            await transport.write(framer.buildAdu(slaveId, pdu));
            return void 0;
          }
          const responsePdu = await protocol.exchange(slaveId, pdu, timeLeft);
          if ((responsePdu[0] & 128) !== 0) {
            const excCode = responsePdu[1];
            const modbusExc = ModbusClient.EXCEPTION_CODE_MAP.get(excCode) ?? excCode;
            throw new import_errors.ModbusExceptionError(responsePdu[0] & 127, modbusExc);
          }
          logger.info("Response received", {
            slaveId,
            funcCode,
            responseTime: Date.now() - startTime
          });
          return responsePdu;
        } catch (err) {
          lastError = err;
          const elapsed = Date.now() - startTime;
          logger.warn(
            `Attempt #${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
            { slaveId, funcCode, responseTime: elapsed }
          );
          if (attempt < this.retryCount) {
            const delay = err instanceof import_errors.ModbusFlushError ? 50 : this.retryDelay;
            await new Promise((resolve) => setTimeout(resolve, delay));
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
