"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var errors_exports = {};
__export(errors_exports, {
  ModbusCRCError: () => ModbusCRCError,
  ModbusError: () => ModbusError,
  ModbusExceptionError: () => ModbusExceptionError,
  ModbusFlushError: () => ModbusFlushError,
  ModbusResponseError: () => ModbusResponseError,
  ModbusTimeoutError: () => ModbusTimeoutError,
  ModbusTooManyEmptyReadsError: () => ModbusTooManyEmptyReadsError,
  NodeSerialConnectionError: () => NodeSerialConnectionError,
  NodeSerialReadError: () => NodeSerialReadError,
  NodeSerialTransportError: () => NodeSerialTransportError,
  NodeSerialWriteError: () => NodeSerialWriteError,
  PollingManagerError: () => PollingManagerError,
  PollingTaskAlreadyExistsError: () => PollingTaskAlreadyExistsError,
  PollingTaskNotFoundError: () => PollingTaskNotFoundError,
  PollingTaskValidationError: () => PollingTaskValidationError,
  TransportError: () => TransportError,
  WebSerialConnectionError: () => WebSerialConnectionError,
  WebSerialReadError: () => WebSerialReadError,
  WebSerialTransportError: () => WebSerialTransportError,
  WebSerialWriteError: () => WebSerialWriteError
});
module.exports = __toCommonJS(errors_exports);
var import_constants = require("./constants/constants.js");
class ModbusError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModbusError";
  }
}
class ModbusTimeoutError extends ModbusError {
  constructor(message = "Modbus request timed out") {
    super(message);
    this.name = "ModbusTimeoutError";
  }
}
class ModbusCRCError extends ModbusError {
  constructor(message = "Modbus CRC check failed") {
    super(message);
    this.name = "ModbusCRCError";
  }
}
class ModbusResponseError extends ModbusError {
  constructor(message = "Invalid Modbus response") {
    super(message);
    this.name = "ModbusResponseError";
  }
}
class ModbusTooManyEmptyReadsError extends ModbusError {
  constructor(message = "Too many empty reads from transport") {
    super(message);
    this.name = "ModbusTooManyEmptyReadsError";
  }
}
class ModbusExceptionError extends ModbusError {
  functionCode;
  exceptionCode;
  constructor(functionCode, exceptionCode) {
    const exceptionMessage = import_constants.EXCEPTION_CODES[exceptionCode] || "Unknown Exception";
    super(
      `Modbus exception: function 0x${functionCode.toString(16)}, code 0x${exceptionCode.toString(16)} (${exceptionMessage})`
    );
    this.name = "ModbusExceptionError";
    this.functionCode = functionCode;
    this.exceptionCode = exceptionCode;
  }
}
class ModbusFlushError extends ModbusError {
  constructor(message = "Modbus operation interrupted by transport flush") {
    super(message);
    this.name = "ModbusFlushError";
  }
}
class TransportError extends ModbusError {
  constructor(message) {
    super(message);
    this.name = "TransportError";
  }
}
class WebSerialTransportError extends TransportError {
  constructor(message) {
    super(message);
    this.name = "WebSerialTransportError";
  }
}
class WebSerialConnectionError extends WebSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "WebSerialConnectionError";
  }
}
class WebSerialReadError extends WebSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "WebSerialReadError";
  }
}
class WebSerialWriteError extends WebSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "WebSerialWriteError";
  }
}
class NodeSerialTransportError extends TransportError {
  constructor(message) {
    super(message);
    this.name = "NodeSerialTransportError";
  }
}
class NodeSerialConnectionError extends NodeSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "NodeSerialConnectionError";
  }
}
class NodeSerialReadError extends NodeSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "NodeSerialReadError";
  }
}
class NodeSerialWriteError extends NodeSerialTransportError {
  constructor(message) {
    super(message);
    this.name = "NodeSerialWriteError";
  }
}
class PollingManagerError extends ModbusError {
  constructor(message) {
    super(message);
    this.name = "PollingManagerError";
  }
}
class PollingTaskAlreadyExistsError extends PollingManagerError {
  constructor(id) {
    super(`Polling task with id "${id}" already exists.`);
    this.name = "PollingTaskAlreadyExistsError";
  }
}
class PollingTaskNotFoundError extends PollingManagerError {
  constructor(id) {
    super(`Polling task with id "${id}" does not exist.`);
    this.name = "PollingTaskNotFoundError";
  }
}
class PollingTaskValidationError extends PollingManagerError {
  constructor(message) {
    super(message);
    this.name = "PollingTaskValidationError";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ModbusCRCError,
  ModbusError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusResponseError,
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
  NodeSerialConnectionError,
  NodeSerialReadError,
  NodeSerialTransportError,
  NodeSerialWriteError,
  PollingManagerError,
  PollingTaskAlreadyExistsError,
  PollingTaskNotFoundError,
  PollingTaskValidationError,
  TransportError,
  WebSerialConnectionError,
  WebSerialReadError,
  WebSerialTransportError,
  WebSerialWriteError
});
