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
var import_logger = __toESM(require("../logger.js"));
var import_constants = require("../constants/constants.js");
var import_errors = require("../errors.js");
var import_crc = require("../utils/crc.js");
class SlaveEmulator {
  slaveAddress;
  coils;
  discreteInputs;
  holdingRegisters;
  inputRegisters;
  exceptions;
  _infinityTasks;
  loggerEnabled;
  logger;
  connected;
  constructor(slaveAddress = 1, options = {}) {
    if (typeof slaveAddress !== "number" || slaveAddress < 0 || slaveAddress > 247) {
      throw new import_errors.ModbusInvalidAddressError(slaveAddress);
    }
    this.slaveAddress = slaveAddress;
    this.coils = /* @__PURE__ */ new Map();
    this.discreteInputs = /* @__PURE__ */ new Map();
    this.holdingRegisters = /* @__PURE__ */ new Map();
    this.inputRegisters = /* @__PURE__ */ new Map();
    this.exceptions = /* @__PURE__ */ new Map();
    this._infinityTasks = /* @__PURE__ */ new Map();
    this.loggerEnabled = !!options.loggerEnabled;
    const loggerInstance = new import_logger.default();
    this.logger = loggerInstance.createLogger("SlaveEmulator");
    if (!this.loggerEnabled) {
      this.logger.setLevel("error");
    } else {
      this.logger.setLevel("info");
    }
    this.connected = false;
  }
  enableLogger() {
    if (!this.loggerEnabled) {
      this.loggerEnabled = true;
      this.logger.setLevel("info");
    }
  }
  disableLogger() {
    if (this.loggerEnabled) {
      this.loggerEnabled = false;
      this.logger.setLevel("error");
    }
  }
  async connect() {
    this.logger.info("Connecting to emulator...", {
      slaveAddress: this.slaveAddress
    });
    this.connected = true;
    this.logger.info("Connected", { slaveAddress: this.slaveAddress });
  }
  async disconnect() {
    this.logger.info("Disconnecting from emulator...", {
      slaveAddress: this.slaveAddress
    });
    this.connected = false;
    this.logger.info("Disconnected", { slaveAddress: this.slaveAddress });
  }
  _validateAddress(address) {
    if (typeof address !== "number" || address < 0 || address > 65535) {
      throw new import_errors.ModbusInvalidAddressError(address);
    }
  }
  _validateQuantity(quantity, max = 125) {
    if (typeof quantity !== "number" || quantity <= 0 || quantity > max) {
      throw new import_errors.ModbusInvalidQuantityError(quantity, 1, max);
    }
  }
  _validateValue(value, isRegister = false) {
    if (isRegister) {
      if (typeof value !== "number" || value < 0 || value > 65535) {
        throw new import_errors.ModbusIllegalDataValueError(value, "between 0 and 65535");
      }
    } else {
      if (typeof value !== "boolean") {
        throw new import_errors.ModbusIllegalDataValueError(value, "boolean");
      }
    }
  }
  infinityChange(params) {
    const { typeRegister, register, range, interval } = params;
    if (!typeRegister || typeof register !== "number" || !Array.isArray(range) || range.length !== 2) {
      throw new import_errors.ModbusDataConversionError(params, "valid InfinityChangeParams");
    }
    if (typeof interval !== "number" || interval <= 0) {
      throw new import_errors.ModbusDataConversionError(interval, "positive number");
    }
    const key = `${typeRegister}:${register}`;
    this.stopInfinityChange({ typeRegister, register });
    const [min, max] = range;
    const setters = {
      Holding: (addr, val) => this.setHoldingRegister(addr, val),
      Input: (addr, val) => this.setInputRegister(addr, val),
      Coil: (addr, val) => this.setCoil(addr, val),
      Discrete: (addr, val) => this.setDiscreteInput(addr, val)
    };
    const setter = setters[typeRegister];
    if (!setter) {
      throw new import_errors.ModbusDataConversionError(typeRegister, "valid register type");
    }
    if (min > max) {
      throw new import_errors.ModbusDataConversionError(range, "valid range (min <= max)");
    }
    const intervalId = setInterval(() => {
      try {
        const value = typeRegister === "Holding" || typeRegister === "Input" ? Math.floor(Math.random() * (max - min + 1)) + min : Math.random() < 0.5;
        setter(register, value);
        this.logger.debug("Infinity change updated", {
          typeRegister,
          register,
          value,
          slaveAddress: this.slaveAddress
        });
      } catch (error) {
        if (error instanceof import_errors.ModbusExceptionError) {
          this.logger.error("Modbus exception in infinity change task", {
            error: error.message,
            functionCode: error.functionCode,
            exceptionCode: error.exceptionCode,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidAddressError) {
          this.logger.error("Invalid address in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidQuantityError) {
          this.logger.error("Invalid quantity in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusIllegalDataValueError) {
          this.logger.error("Illegal data value in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusIllegalDataAddressError) {
          this.logger.error("Illegal data address in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusSlaveDeviceFailureError) {
          this.logger.error("Slave device failure in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusCRCError) {
          this.logger.error("CRC error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusResponseError) {
          this.logger.error("Response error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusTimeoutError) {
          this.logger.error("Timeout error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusFlushError) {
          this.logger.error("Flush error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusDataConversionError) {
          this.logger.error("Data conversion error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusBufferOverflowError) {
          this.logger.error("Buffer overflow error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusBufferUnderrunError) {
          this.logger.error("Buffer underrun error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusMemoryError) {
          this.logger.error("Memory error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusStackOverflowError) {
          this.logger.error("Stack overflow error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidFunctionCodeError) {
          this.logger.error("Invalid function code error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusSlaveBusyError) {
          this.logger.error("Slave busy error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusAcknowledgeError) {
          this.logger.error("Acknowledge error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusMemoryParityError) {
          this.logger.error("Memory parity error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusGatewayPathUnavailableError) {
          this.logger.error("Gateway path unavailable error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusGatewayTargetDeviceError) {
          this.logger.error("Gateway target device error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusGatewayBusyError) {
          this.logger.error("Gateway busy error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusDataOverrunError) {
          this.logger.error("Data overrun error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusBroadcastError) {
          this.logger.error("Broadcast error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusConfigError) {
          this.logger.error("Config error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusBaudRateError) {
          this.logger.error("Baud rate error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusSyncError) {
          this.logger.error("Sync error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusFrameBoundaryError) {
          this.logger.error("Frame boundary error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusLRCError) {
          this.logger.error("LRC error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusChecksumError) {
          this.logger.error("Checksum error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusParityError) {
          this.logger.error("Parity error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusNoiseError) {
          this.logger.error("Noise error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusFramingError) {
          this.logger.error("Framing error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusOverrunError) {
          this.logger.error("Overrun error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusCollisionError) {
          this.logger.error("Collision error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusTooManyEmptyReadsError) {
          this.logger.error("Too many empty reads error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInterFrameTimeoutError) {
          this.logger.error("Inter-frame timeout error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusSilentIntervalError) {
          this.logger.error("Silent interval error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidStartingAddressError) {
          this.logger.error("Invalid starting address error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusMalformedFrameError) {
          this.logger.error("Malformed frame error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidFrameLengthError) {
          this.logger.error("Invalid frame length error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInvalidTransactionIdError) {
          this.logger.error("Invalid transaction ID error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusUnexpectedFunctionCodeError) {
          this.logger.error("Unexpected function code error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusConnectionRefusedError) {
          this.logger.error("Connection refused error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusConnectionTimeoutError) {
          this.logger.error("Connection timeout error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusNotConnectedError) {
          this.logger.error("Not connected error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusAlreadyConnectedError) {
          this.logger.error("Already connected error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else if (error instanceof import_errors.ModbusInsufficientDataError) {
          this.logger.error("Insufficient data error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        } else {
          this.logger.error("Error in infinity change task", {
            error: error.message,
            typeRegister,
            register,
            slaveAddress: this.slaveAddress
          });
        }
      }
    }, interval);
    this._infinityTasks.set(key, intervalId);
    this.logger.info("Infinity change started", {
      typeRegister,
      register,
      interval,
      slaveAddress: this.slaveAddress
    });
  }
  stopInfinityChange(params) {
    const { typeRegister, register } = params;
    const key = `${typeRegister}:${register}`;
    if (this._infinityTasks.has(key)) {
      const intervalId = this._infinityTasks.get(key);
      if (intervalId) {
        clearInterval(intervalId);
      }
      this._infinityTasks.delete(key);
      this.logger.debug("Infinity change stopped", {
        typeRegister,
        register,
        slaveAddress: this.slaveAddress
      });
    }
  }
  setException(functionCode, address, exceptionCode) {
    this._validateAddress(address);
    this.exceptions.set(`${functionCode}_${address}`, exceptionCode);
    this.logger.info(
      `Exception set: functionCode=0x${functionCode.toString(16)}, address=${address}, exceptionCode=0x${exceptionCode.toString(16)}`,
      {
        functionCode: `0x${functionCode.toString(16)}`,
        address,
        exceptionCode,
        slaveAddress: this.slaveAddress
      }
    );
  }
  _checkException(functionCode, address) {
    this._validateAddress(address);
    const key = `${functionCode}_${address}`;
    if (this.exceptions.has(key)) {
      const exCode = this.exceptions.get(key);
      this.logger.warn(
        `Throwing exception for function 0x${functionCode.toString(16)} at address ${address}: code 0x${exCode.toString(16)}`,
        {
          functionCode: `0x${functionCode.toString(16)}`,
          address,
          exceptionCode: exCode,
          slaveAddress: this.slaveAddress
        }
      );
      throw new import_errors.ModbusExceptionError(functionCode, exCode);
    }
  }
  addRegisters(definitions) {
    if (!definitions || typeof definitions !== "object") {
      throw new import_errors.ModbusDataConversionError(definitions, "valid RegisterDefinitions object");
    }
    const stats = { coils: 0, discrete: 0, holding: 0, input: 0 };
    try {
      if (Array.isArray(definitions.coils)) {
        for (const { start, value } of definitions.coils) {
          this.setCoil(start, value);
          stats.coils++;
        }
      }
      if (Array.isArray(definitions.discrete)) {
        for (const { start, value } of definitions.discrete) {
          this.setDiscreteInput(start, value);
          stats.discrete++;
        }
      }
      if (Array.isArray(definitions.holding)) {
        for (const { start, value } of definitions.holding) {
          this.setHoldingRegister(start, value);
          stats.holding++;
        }
      }
      if (Array.isArray(definitions.input)) {
        for (const { start, value } of definitions.input) {
          this.setInputRegister(start, value);
          stats.input++;
        }
      }
      this.logger.info("Registers added successfully", {
        ...stats,
        slaveAddress: this.slaveAddress
      });
    } catch (error) {
      if (error instanceof import_errors.ModbusExceptionError) {
        this.logger.error("Modbus exception adding registers", {
          error: error.message,
          functionCode: error.functionCode,
          exceptionCode: error.exceptionCode,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidAddressError) {
        this.logger.error("Invalid address adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidQuantityError) {
        this.logger.error("Invalid quantity adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusIllegalDataValueError) {
        this.logger.error("Illegal data value adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusIllegalDataAddressError) {
        this.logger.error("Illegal data address adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusSlaveDeviceFailureError) {
        this.logger.error("Slave device failure adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusCRCError) {
        this.logger.error("CRC error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusResponseError) {
        this.logger.error("Response error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusTimeoutError) {
        this.logger.error("Timeout error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusFlushError) {
        this.logger.error("Flush error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusDataConversionError) {
        this.logger.error("Data conversion error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusBufferOverflowError) {
        this.logger.error("Buffer overflow error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusBufferUnderrunError) {
        this.logger.error("Buffer underrun error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusMemoryError) {
        this.logger.error("Memory error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusStackOverflowError) {
        this.logger.error("Stack overflow error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidFunctionCodeError) {
        this.logger.error("Invalid function code error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusSlaveBusyError) {
        this.logger.error("Slave busy error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusAcknowledgeError) {
        this.logger.error("Acknowledge error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusMemoryParityError) {
        this.logger.error("Memory parity error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusGatewayPathUnavailableError) {
        this.logger.error("Gateway path unavailable error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusGatewayTargetDeviceError) {
        this.logger.error("Gateway target device error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusGatewayBusyError) {
        this.logger.error("Gateway busy error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusDataOverrunError) {
        this.logger.error("Data overrun error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusBroadcastError) {
        this.logger.error("Broadcast error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusConfigError) {
        this.logger.error("Config error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusBaudRateError) {
        this.logger.error("Baud rate error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusSyncError) {
        this.logger.error("Sync error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusFrameBoundaryError) {
        this.logger.error("Frame boundary error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusLRCError) {
        this.logger.error("LRC error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusChecksumError) {
        this.logger.error("Checksum error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusParityError) {
        this.logger.error("Parity error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusNoiseError) {
        this.logger.error("Noise error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusFramingError) {
        this.logger.error("Framing error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusOverrunError) {
        this.logger.error("Overrun error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusCollisionError) {
        this.logger.error("Collision error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusTooManyEmptyReadsError) {
        this.logger.error("Too many empty reads error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInterFrameTimeoutError) {
        this.logger.error("Inter-frame timeout error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusSilentIntervalError) {
        this.logger.error("Silent interval error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidStartingAddressError) {
        this.logger.error("Invalid starting address error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusMalformedFrameError) {
        this.logger.error("Malformed frame error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidFrameLengthError) {
        this.logger.error("Invalid frame length error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInvalidTransactionIdError) {
        this.logger.error("Invalid transaction ID error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusUnexpectedFunctionCodeError) {
        this.logger.error("Unexpected function code error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusConnectionRefusedError) {
        this.logger.error("Connection refused error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusConnectionTimeoutError) {
        this.logger.error("Connection timeout error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusNotConnectedError) {
        this.logger.error("Not connected error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusAlreadyConnectedError) {
        this.logger.error("Already connected error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else if (error instanceof import_errors.ModbusInsufficientDataError) {
        this.logger.error("Insufficient data error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      } else {
        this.logger.error("Error adding registers", {
          error: error.message,
          definitions: JSON.stringify(definitions),
          slaveAddress: this.slaveAddress
        });
      }
      throw error;
    }
  }
  setCoil(address, value) {
    this._validateAddress(address);
    this._validateValue(value, false);
    this.coils.set(address, !!value);
    this.logger.debug("Coil set", {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress
    });
  }
  getCoil(address) {
    this._validateAddress(address);
    return this.coils.get(address) || false;
  }
  readCoils(startAddress, quantity) {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2e3);
    if (startAddress + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, quantity);
    }
    this.logger.info("readCoils", {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress
    });
    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(import_constants.ModbusFunctionCode.READ_COILS, addr);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getCoil(startAddress + i));
    }
    return result;
  }
  writeSingleCoil(address, value) {
    this._validateAddress(address);
    this._validateValue(value, false);
    this._checkException(import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL, address);
    this.setCoil(address, value);
    this.logger.info("writeSingleCoil", {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress
    });
  }
  writeMultipleCoils(startAddress, values) {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 1968);
    if (!Array.isArray(values)) {
      throw new import_errors.ModbusDataConversionError(values, "array");
    }
    if (startAddress + values.length > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, values.length);
    }
    values.forEach((val, idx) => {
      this._validateValue(val, false);
      this._checkException(import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS, startAddress + idx);
    });
    values.forEach((val, idx) => {
      this.setCoil(startAddress + idx, val);
    });
    this.logger.info("writeMultipleCoils", {
      startAddress,
      values: values.length,
      slaveAddress: this.slaveAddress
    });
  }
  setDiscreteInput(address, value) {
    this._validateAddress(address);
    this._validateValue(value, false);
    this.discreteInputs.set(address, !!value);
    this.logger.debug("Discrete Input set", {
      address,
      value: !!value,
      slaveAddress: this.slaveAddress
    });
  }
  getDiscreteInput(address) {
    this._validateAddress(address);
    return this.discreteInputs.get(address) || false;
  }
  readDiscreteInputs(startAddress, quantity) {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 2e3);
    if (startAddress + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, quantity);
    }
    this.logger.info("readDiscreteInputs", {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress
    });
    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(import_constants.ModbusFunctionCode.READ_DISCRETE_INPUTS, addr);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getDiscreteInput(startAddress + i));
    }
    return result;
  }
  setHoldingRegister(address, value) {
    this._validateAddress(address);
    this._validateValue(value, true);
    const maskedValue = value & 65535;
    this.holdingRegisters.set(address, maskedValue);
    this.logger.debug("Holding Register set", {
      address,
      value: maskedValue,
      slaveAddress: this.slaveAddress
    });
  }
  getHoldingRegister(address) {
    this._validateAddress(address);
    return this.holdingRegisters.get(address) || 0;
  }
  readHoldingRegisters(startAddress, quantity) {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);
    if (startAddress + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, quantity);
    }
    this.logger.info("readHoldingRegisters", {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress
    });
    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getHoldingRegister(startAddress + i));
    }
    return result;
  }
  writeSingleRegister(address, value) {
    this._validateAddress(address);
    this._validateValue(value, true);
    this._checkException(import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER, address);
    this.setHoldingRegister(address, value);
    this.logger.info("writeSingleRegister", {
      address,
      value,
      slaveAddress: this.slaveAddress
    });
  }
  writeMultipleRegisters(startAddress, values) {
    this._validateAddress(startAddress);
    this._validateQuantity(values.length, 123);
    if (!Array.isArray(values)) {
      throw new import_errors.ModbusDataConversionError(values, "array");
    }
    if (startAddress + values.length > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, values.length);
    }
    values.forEach((val, idx) => {
      this._validateValue(val, true);
      this._checkException(import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, startAddress + idx);
    });
    values.forEach((val, idx) => {
      this.setHoldingRegister(startAddress + idx, val);
    });
    this.logger.info("writeMultipleRegisters", {
      startAddress,
      values: values.length,
      slaveAddress: this.slaveAddress
    });
  }
  setInputRegister(address, value) {
    this._validateAddress(address);
    this._validateValue(value, true);
    const maskedValue = value & 65535;
    this.inputRegisters.set(address, maskedValue);
    this.logger.debug("Input Register set", {
      address,
      value: maskedValue,
      slaveAddress: this.slaveAddress
    });
  }
  getInputRegister(address) {
    this._validateAddress(address);
    return this.inputRegisters.get(address) || 0;
  }
  readInputRegisters(startAddress, quantity) {
    this._validateAddress(startAddress);
    this._validateQuantity(quantity, 125);
    if (startAddress + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(startAddress, quantity);
    }
    this.logger.info("readInputRegisters", {
      startAddress,
      quantity,
      slaveAddress: this.slaveAddress
    });
    for (let addr = startAddress; addr < startAddress + quantity; addr++) {
      this._checkException(import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      result.push(this.getInputRegister(startAddress + i));
    }
    return result;
  }
  // --- Прямые методы (без RTU) ---
  readHolding(start, quantity) {
    this._validateAddress(start);
    this._validateQuantity(quantity, 125);
    if (start + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(start, quantity);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS, addr);
      result.push(this.getHoldingRegister(addr));
    }
    return result;
  }
  readInput(start, quantity) {
    this._validateAddress(start);
    this._validateQuantity(quantity, 125);
    if (start + quantity > 65536) {
      throw new import_errors.ModbusIllegalDataAddressError(start, quantity);
    }
    const result = [];
    for (let i = 0; i < quantity; i++) {
      const addr = start + i;
      this._checkException(import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS, addr);
      result.push(this.getInputRegister(addr));
    }
    return result;
  }
  // --- Методы диагностики и мониторинга ---
  getRegisterStats() {
    return {
      coils: this.coils.size,
      discreteInputs: this.discreteInputs.size,
      holdingRegisters: this.holdingRegisters.size,
      inputRegisters: this.inputRegisters.size,
      exceptions: this.exceptions.size,
      infinityTasks: this._infinityTasks.size
    };
  }
  getRegisterDump() {
    return {
      coils: Object.fromEntries(this.coils),
      discreteInputs: Object.fromEntries(this.discreteInputs),
      holdingRegisters: Object.fromEntries(this.holdingRegisters),
      inputRegisters: Object.fromEntries(this.inputRegisters)
    };
  }
  getInfinityTasks() {
    return Array.from(this._infinityTasks.keys());
  }
  clearAllRegisters() {
    this.coils.clear();
    this.discreteInputs.clear();
    this.holdingRegisters.clear();
    this.inputRegisters.clear();
    this.logger.info("All registers cleared", { slaveAddress: this.slaveAddress });
  }
  clearExceptions() {
    this.exceptions.clear();
    this.logger.info("All exceptions cleared", {
      slaveAddress: this.slaveAddress
    });
  }
  clearInfinityTasks() {
    for (const intervalId of this._infinityTasks.values()) {
      clearInterval(intervalId);
    }
    this._infinityTasks.clear();
    this.logger.info("All infinity tasks cleared", {
      slaveAddress: this.slaveAddress
    });
  }
  // --- Graceful shutdown ---
  async destroy() {
    this.logger.info("Destroying SlaveEmulator", {
      slaveAddress: this.slaveAddress
    });
    this.clearInfinityTasks();
    if (this.connected) {
      await this.disconnect();
    }
    this.clearAllRegisters();
    this.clearExceptions();
    this.logger.info("SlaveEmulator destroyed", {
      slaveAddress: this.slaveAddress
    });
  }
  // --- Modbus RTU Frame handler ---
  handleRequest(buffer) {
    try {
      if (!this.connected) {
        this.logger.warn("Received request but emulator not connected", {
          slaveAddress: this.slaveAddress
        });
        return null;
      }
      if (!(buffer instanceof Uint8Array)) {
        throw new import_errors.ModbusDataConversionError(buffer, "Uint8Array");
      }
      if (buffer.length < 5) {
        throw new import_errors.ModbusResponseError("Invalid Modbus RTU frame: too short");
      }
      const crcReceived = (buffer[buffer.length - 2] | buffer[buffer.length - 1] << 8) & 65535;
      const dataForCrc = buffer.subarray(0, buffer.length - 2);
      const crcCalculatedBuffer = (0, import_crc.crc16Modbus)(dataForCrc);
      if (crcCalculatedBuffer.length < 2) {
        throw new import_errors.ModbusCRCError("crc16Modbus returned invalid buffer length");
      }
      const crcCalculated = crcCalculatedBuffer[0] << 8 | crcCalculatedBuffer[1];
      if (crcReceived !== crcCalculated) {
        this.logger.warn("CRC mismatch", {
          received: `0x${crcReceived.toString(16)}`,
          calculated: `0x${crcCalculated.toString(16)}`,
          frame: Buffer.from(buffer).toString("hex"),
          slaveAddress: this.slaveAddress
        });
        throw new import_errors.ModbusCRCError("CRC mismatch detected");
      }
      const slaveAddr = buffer[0];
      if (slaveAddr !== this.slaveAddress && slaveAddr !== 0) {
        this.logger.debug("Frame ignored - wrong slave address", {
          targetSlave: slaveAddr,
          thisSlave: this.slaveAddress
        });
        return null;
      }
      const functionCode = buffer[1];
      const data = buffer.subarray(2, buffer.length - 2);
      this.logger.info("Modbus request received", {
        slaveAddress: slaveAddr,
        functionCode: `0x${functionCode.toString(16)}`,
        data: Buffer.from(data).toString("hex"),
        dataLength: data.length
      });
      return this._processFunctionCode(functionCode, data, slaveAddr);
    } catch (error) {
      if (error instanceof import_errors.ModbusExceptionError) {
        this.logger.error("Modbus exception processing request", {
          error: error.message,
          functionCode: error.functionCode,
          exceptionCode: error.exceptionCode,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(error.functionCode, error.exceptionCode);
      } else if (error instanceof import_errors.ModbusInvalidAddressError) {
        this.logger.error("Invalid address processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof import_errors.ModbusInvalidQuantityError) {
        this.logger.error("Invalid quantity processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_DATA_VALUE
        );
      } else if (error instanceof import_errors.ModbusIllegalDataValueError) {
        this.logger.error("Illegal data value processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_DATA_VALUE
        );
      } else if (error instanceof import_errors.ModbusIllegalDataAddressError) {
        this.logger.error("Illegal data address processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof import_errors.ModbusSlaveDeviceFailureError) {
        this.logger.error("Slave device failure processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusCRCError) {
        this.logger.error("CRC error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusResponseError) {
        this.logger.error("Response error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusTimeoutError) {
        this.logger.error("Timeout error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusFlushError) {
        this.logger.error("Flush error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusDataConversionError) {
        this.logger.error("Data conversion error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusBufferOverflowError) {
        this.logger.error("Buffer overflow error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusBufferUnderrunError) {
        this.logger.error("Buffer underrun error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusMemoryError) {
        this.logger.error("Memory error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusStackOverflowError) {
        this.logger.error("Stack overflow error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInvalidFunctionCodeError) {
        this.logger.error("Invalid function code error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_FUNCTION
        );
      } else if (error instanceof import_errors.ModbusSlaveBusyError) {
        this.logger.error("Slave busy error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_BUSY
        );
      } else if (error instanceof import_errors.ModbusAcknowledgeError) {
        this.logger.error("Acknowledge error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(buffer?.[1] || 0, import_constants.ModbusExceptionCode.ACKNOWLEDGE);
      } else if (error instanceof import_errors.ModbusMemoryParityError) {
        this.logger.error("Memory parity error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.MEMORY_PARITY_ERROR
        );
      } else if (error instanceof import_errors.ModbusGatewayPathUnavailableError) {
        this.logger.error("Gateway path unavailable error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE
        );
      } else if (error instanceof import_errors.ModbusGatewayTargetDeviceError) {
        this.logger.error("Gateway target device error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED
        );
      } else if (error instanceof import_errors.ModbusGatewayBusyError) {
        this.logger.error("Gateway busy error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED
        );
      } else if (error instanceof import_errors.ModbusDataOverrunError) {
        this.logger.error("Data overrun error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusBroadcastError) {
        this.logger.error("Broadcast error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusConfigError) {
        this.logger.error("Config error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusBaudRateError) {
        this.logger.error("Baud rate error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusSyncError) {
        this.logger.error("Sync error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusFrameBoundaryError) {
        this.logger.error("Frame boundary error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusLRCError) {
        this.logger.error("LRC error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusChecksumError) {
        this.logger.error("Checksum error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusParityError) {
        this.logger.error("Parity error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusNoiseError) {
        this.logger.error("Noise error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusFramingError) {
        this.logger.error("Framing error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusOverrunError) {
        this.logger.error("Overrun error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusCollisionError) {
        this.logger.error("Collision error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusTooManyEmptyReadsError) {
        this.logger.error("Too many empty reads error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInterFrameTimeoutError) {
        this.logger.error("Inter-frame timeout error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusSilentIntervalError) {
        this.logger.error("Silent interval error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInvalidStartingAddressError) {
        this.logger.error("Invalid starting address error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.ILLEGAL_DATA_ADDRESS
        );
      } else if (error instanceof import_errors.ModbusMalformedFrameError) {
        this.logger.error("Malformed frame error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInvalidFrameLengthError) {
        this.logger.error("Invalid frame length error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInvalidTransactionIdError) {
        this.logger.error("Invalid transaction ID error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusUnexpectedFunctionCodeError) {
        this.logger.error("Unexpected function code error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusConnectionRefusedError) {
        this.logger.error("Connection refused error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusConnectionTimeoutError) {
        this.logger.error("Connection timeout error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusNotConnectedError) {
        this.logger.error("Not connected error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusAlreadyConnectedError) {
        this.logger.error("Already connected error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else if (error instanceof import_errors.ModbusInsufficientDataError) {
        this.logger.error("Insufficient data error processing request", {
          error: error.message,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      } else {
        this.logger.error("Error processing Modbus request", {
          error: error.message,
          stack: error.stack,
          slaveAddress: this.slaveAddress
        });
        return this._createExceptionResponse(
          buffer?.[1] || 0,
          import_constants.ModbusExceptionCode.SLAVE_DEVICE_FAILURE
        );
      }
    }
  }
  _processFunctionCode(functionCode, data, slaveAddr) {
    try {
      let responseData;
      switch (functionCode) {
        case import_constants.ModbusFunctionCode.READ_COILS:
          responseData = this._handleReadCoils(data);
          break;
        case import_constants.ModbusFunctionCode.READ_DISCRETE_INPUTS:
          responseData = this._handleReadDiscreteInputs(data);
          break;
        case import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS:
          responseData = this._handleReadHoldingRegisters(data);
          break;
        case import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS:
          responseData = this._handleReadInputRegisters(data);
          break;
        case import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL:
          responseData = this._handleWriteSingleCoil(data);
          break;
        case import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER:
          responseData = this._handleWriteSingleRegister(data);
          break;
        case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS:
          responseData = this._handleWriteMultipleCoils(data);
          break;
        case import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS:
          responseData = this._handleWriteMultipleRegisters(data);
          break;
        default:
          this.logger.warn("Unsupported function code", {
            functionCode: `0x${functionCode.toString(16)}`,
            slaveAddress: this.slaveAddress
          });
          throw new import_errors.ModbusExceptionError(functionCode, import_constants.ModbusExceptionCode.ILLEGAL_FUNCTION);
      }
      return this._createSuccessResponse(slaveAddr, functionCode, responseData);
    } catch (error) {
      if (error instanceof import_errors.ModbusExceptionError) {
        return this._createExceptionResponse(functionCode, error.exceptionCode);
      }
      throw error;
    }
  }
  // Специализированные методы обработки
  _handleReadCoils(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Read Coils");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 2e3);
    const coils = this.readCoils(startAddr, qty);
    const byteCount = Math.ceil(qty / 8);
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;
    for (let i = 0; i < qty; i++) {
      if (coils[i]) {
        resp[1 + Math.floor(i / 8)] |= 1 << i % 8;
      }
    }
    return resp;
  }
  _handleReadDiscreteInputs(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Read Discrete Inputs");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 2e3);
    const inputs = this.readDiscreteInputs(startAddr, qty);
    const byteCount = Math.ceil(qty / 8);
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;
    for (let i = 0; i < qty; i++) {
      if (inputs[i]) {
        resp[1 + Math.floor(i / 8)] |= 1 << i % 8;
      }
    }
    return resp;
  }
  _handleReadHoldingRegisters(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Read Holding Registers");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 125);
    const registers = this.readHoldingRegisters(startAddr, qty);
    const byteCount = qty * 2;
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;
    for (let i = 0; i < qty; i++) {
      resp[1 + i * 2] = registers[i] >> 8;
      resp[2 + i * 2] = registers[i] & 255;
    }
    return resp;
  }
  _handleReadInputRegisters(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Read Input Registers");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 125);
    const registers = this.readInputRegisters(startAddr, qty);
    const byteCount = qty * 2;
    const resp = new Uint8Array(1 + byteCount);
    resp[0] = byteCount;
    for (let i = 0; i < qty; i++) {
      resp[1 + i * 2] = registers[i] >> 8;
      resp[2 + i * 2] = registers[i] & 255;
    }
    return resp;
  }
  _handleWriteSingleCoil(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Write Single Coil");
    }
    const addr = data[0] << 8 | data[1];
    const val = data[2] << 8 | data[3];
    if (val !== 0 && val !== 65280) {
      throw new import_errors.ModbusIllegalDataValueError(val, "0x0000 or 0xff00");
    }
    this._validateAddress(addr);
    this.writeSingleCoil(addr, val === 65280);
    return data;
  }
  _handleWriteSingleRegister(data) {
    if (data.length !== 4) {
      throw new import_errors.ModbusResponseError("Invalid data length for Write Single Register");
    }
    const addr = data[0] << 8 | data[1];
    const val = data[2] << 8 | data[3];
    this._validateAddress(addr);
    this._validateValue(val, true);
    this.writeSingleRegister(addr, val);
    return data;
  }
  _handleWriteMultipleCoils(data) {
    if (data.length < 5) {
      throw new import_errors.ModbusResponseError("Invalid data length for Write Multiple Coils");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    const byteCount = data[4];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 1968);
    if (byteCount !== data.length - 5) {
      throw new import_errors.ModbusResponseError("Byte count mismatch");
    }
    const coilValues = [];
    for (let i = 0; i < qty; i++) {
      const byteIndex = 5 + Math.floor(i / 8);
      const bitIndex = i % 8;
      coilValues.push((data[byteIndex] & 1 << bitIndex) !== 0);
    }
    this.writeMultipleCoils(startAddr, coilValues);
    return data.subarray(0, 4);
  }
  _handleWriteMultipleRegisters(data) {
    if (data.length < 5) {
      throw new import_errors.ModbusResponseError("Invalid data length for Write Multiple Registers");
    }
    const startAddr = data[0] << 8 | data[1];
    const qty = data[2] << 8 | data[3];
    const byteCount = data[4];
    this._validateAddress(startAddr);
    this._validateQuantity(qty, 123);
    if (byteCount !== qty * 2) {
      throw new import_errors.ModbusResponseError("Byte count mismatch");
    }
    const regValues = [];
    for (let i = 0; i < qty; i++) {
      regValues.push(data[5 + i * 2] << 8 | data[6 + i * 2]);
    }
    this.writeMultipleRegisters(startAddr, regValues);
    return data.subarray(0, 4);
  }
  _createSuccessResponse(slaveAddr, functionCode, responseData) {
    const respBuf = new Uint8Array(2 + responseData.length + 2);
    respBuf[0] = slaveAddr;
    respBuf[1] = functionCode;
    respBuf.set(responseData, 2);
    const crc = (0, import_crc.crc16Modbus)(respBuf.subarray(0, respBuf.length - 2));
    if (crc.length < 2) {
      throw new import_errors.ModbusCRCError("crc16Modbus returned invalid buffer length");
    }
    const crcValue = crc[0] << 8 | crc[1];
    respBuf[respBuf.length - 2] = crcValue & 255;
    respBuf[respBuf.length - 1] = crcValue >> 8;
    this.logger.info("Modbus response created", {
      response: Buffer.from(respBuf).toString("hex"),
      length: respBuf.length,
      slaveAddress: this.slaveAddress
    });
    return respBuf;
  }
  _createExceptionResponse(functionCode, exceptionCode) {
    const excBuf = new Uint8Array(5);
    excBuf[0] = this.slaveAddress;
    excBuf[1] = functionCode | 128;
    excBuf[2] = exceptionCode;
    const crc = (0, import_crc.crc16Modbus)(excBuf.subarray(0, 3));
    if (crc.length < 2) {
      throw new import_errors.ModbusCRCError("crc16Modbus returned invalid buffer length");
    }
    const crcValue = crc[0] << 8 | crc[1];
    excBuf[3] = crcValue & 255;
    excBuf[4] = crcValue >> 8;
    this.logger.warn("Exception response created", {
      response: Buffer.from(excBuf).toString("hex"),
      functionCode: `0x${functionCode.toString(16)}`,
      exceptionCode,
      slaveAddress: this.slaveAddress
    });
    return excBuf;
  }
}
module.exports = SlaveEmulator;
