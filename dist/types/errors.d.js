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
var errors_d_exports = {};
__export(errors_d_exports, {
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
module.exports = __toCommonJS(errors_d_exports);
class ModbusError extends Error {
}
class ModbusTimeoutError extends ModbusError {
}
class ModbusCRCError extends ModbusError {
}
class ModbusResponseError extends ModbusError {
}
class ModbusTooManyEmptyReadsError extends ModbusError {
}
class ModbusExceptionError extends ModbusError {
  functionCode;
  exceptionCode;
}
class ModbusFlushError extends ModbusError {
}
class TransportError extends ModbusError {
}
class WebSerialTransportError extends TransportError {
}
class WebSerialConnectionError extends WebSerialTransportError {
}
class WebSerialReadError extends WebSerialTransportError {
}
class WebSerialWriteError extends WebSerialTransportError {
}
class NodeSerialTransportError extends TransportError {
}
class NodeSerialConnectionError extends NodeSerialTransportError {
}
class NodeSerialReadError extends NodeSerialTransportError {
}
class NodeSerialWriteError extends NodeSerialTransportError {
}
class PollingManagerError extends ModbusError {
}
class PollingTaskAlreadyExistsError extends PollingManagerError {
}
class PollingTaskNotFoundError extends PollingManagerError {
}
class PollingTaskValidationError extends PollingManagerError {
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
