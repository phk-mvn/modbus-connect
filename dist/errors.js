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
  ModbusAcknowledgeError: () => ModbusAcknowledgeError,
  ModbusAlreadyConnectedError: () => ModbusAlreadyConnectedError,
  ModbusBaudRateError: () => ModbusBaudRateError,
  ModbusBroadcastError: () => ModbusBroadcastError,
  ModbusBufferOverflowError: () => ModbusBufferOverflowError,
  ModbusBufferUnderrunError: () => ModbusBufferUnderrunError,
  ModbusCRCError: () => ModbusCRCError,
  ModbusChecksumError: () => ModbusChecksumError,
  ModbusCollisionError: () => ModbusCollisionError,
  ModbusConfigError: () => ModbusConfigError,
  ModbusConnectionRefusedError: () => ModbusConnectionRefusedError,
  ModbusConnectionTimeoutError: () => ModbusConnectionTimeoutError,
  ModbusDataConversionError: () => ModbusDataConversionError,
  ModbusDataOverrunError: () => ModbusDataOverrunError,
  ModbusError: () => ModbusError,
  ModbusExceptionError: () => ModbusExceptionError,
  ModbusFlushError: () => ModbusFlushError,
  ModbusFrameBoundaryError: () => ModbusFrameBoundaryError,
  ModbusFramingError: () => ModbusFramingError,
  ModbusGatewayBusyError: () => ModbusGatewayBusyError,
  ModbusGatewayPathUnavailableError: () => ModbusGatewayPathUnavailableError,
  ModbusGatewayTargetDeviceError: () => ModbusGatewayTargetDeviceError,
  ModbusIllegalDataAddressError: () => ModbusIllegalDataAddressError,
  ModbusIllegalDataValueError: () => ModbusIllegalDataValueError,
  ModbusInsufficientDataError: () => ModbusInsufficientDataError,
  ModbusInterFrameTimeoutError: () => ModbusInterFrameTimeoutError,
  ModbusInvalidAddressError: () => ModbusInvalidAddressError,
  ModbusInvalidFrameLengthError: () => ModbusInvalidFrameLengthError,
  ModbusInvalidFunctionCodeError: () => ModbusInvalidFunctionCodeError,
  ModbusInvalidQuantityError: () => ModbusInvalidQuantityError,
  ModbusInvalidStartingAddressError: () => ModbusInvalidStartingAddressError,
  ModbusInvalidTransactionIdError: () => ModbusInvalidTransactionIdError,
  ModbusLRCError: () => ModbusLRCError,
  ModbusMalformedFrameError: () => ModbusMalformedFrameError,
  ModbusMemoryError: () => ModbusMemoryError,
  ModbusMemoryParityError: () => ModbusMemoryParityError,
  ModbusNoiseError: () => ModbusNoiseError,
  ModbusNotConnectedError: () => ModbusNotConnectedError,
  ModbusOverrunError: () => ModbusOverrunError,
  ModbusParityError: () => ModbusParityError,
  ModbusResponseError: () => ModbusResponseError,
  ModbusSilentIntervalError: () => ModbusSilentIntervalError,
  ModbusSlaveBusyError: () => ModbusSlaveBusyError,
  ModbusSlaveDeviceFailureError: () => ModbusSlaveDeviceFailureError,
  ModbusStackOverflowError: () => ModbusStackOverflowError,
  ModbusSyncError: () => ModbusSyncError,
  ModbusTimeoutError: () => ModbusTimeoutError,
  ModbusTooManyEmptyReadsError: () => ModbusTooManyEmptyReadsError,
  ModbusUnexpectedFunctionCodeError: () => ModbusUnexpectedFunctionCodeError,
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
    const exceptionMessage = import_constants.MODBUS_EXCEPTION_MESSAGES[exceptionCode] || `Unknown exception code: ${exceptionCode}`;
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
class ModbusInvalidAddressError extends ModbusError {
  constructor(address) {
    super(`Invalid Modbus address: ${address}. Address must be between 0-247 for RTU/TCP.`);
    this.name = "ModbusInvalidAddressError";
  }
}
class ModbusInvalidFunctionCodeError extends ModbusError {
  constructor(functionCode) {
    super(`Invalid Modbus function code: 0x${functionCode.toString(16)}`);
    this.name = "ModbusInvalidFunctionCodeError";
  }
}
class ModbusInvalidQuantityError extends ModbusError {
  constructor(quantity, min, max) {
    super(`Invalid quantity: ${quantity}. Must be between ${min}-${max}.`);
    this.name = "ModbusInvalidQuantityError";
  }
}
class ModbusIllegalDataAddressError extends ModbusError {
  constructor(address, quantity) {
    super(`Illegal data address: start=${address}, quantity=${quantity}`);
    this.name = "ModbusIllegalDataAddressError";
  }
}
class ModbusIllegalDataValueError extends ModbusError {
  constructor(value, expected) {
    super(`Illegal data value: ${value}, expected ${expected}`);
    this.name = "ModbusIllegalDataValueError";
  }
}
class ModbusSlaveBusyError extends ModbusError {
  constructor() {
    super("Slave device is busy");
    this.name = "ModbusSlaveBusyError";
  }
}
class ModbusAcknowledgeError extends ModbusError {
  constructor() {
    super("Acknowledge received - device needs continued polling");
    this.name = "ModbusAcknowledgeError";
  }
}
class ModbusSlaveDeviceFailureError extends ModbusError {
  constructor() {
    super("Slave device failure");
    this.name = "ModbusSlaveDeviceFailureError";
  }
}
class ModbusMalformedFrameError extends ModbusResponseError {
  constructor(rawData) {
    super(`Malformed Modbus frame received: ${Buffer.from(rawData).toString("hex")}`);
    this.name = "ModbusMalformedFrameError";
  }
}
class ModbusInvalidFrameLengthError extends ModbusResponseError {
  constructor(received, expected) {
    super(`Invalid frame length: received ${received}, expected ${expected}`);
    this.name = "ModbusInvalidFrameLengthError";
  }
}
class ModbusInvalidTransactionIdError extends ModbusResponseError {
  constructor(received, expected) {
    super(`Invalid transaction ID: received ${received}, expected ${expected}`);
    this.name = "ModbusInvalidTransactionIdError";
  }
}
class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
  constructor(sent, received) {
    super(
      `Unexpected function code: sent 0x${sent.toString(16)}, received 0x${received.toString(16)}`
    );
    this.name = "ModbusUnexpectedFunctionCodeError";
  }
}
class ModbusConnectionRefusedError extends ModbusError {
  constructor(host, port) {
    super(`Connection refused to ${host}:${port}`);
    this.name = "ModbusConnectionRefusedError";
  }
}
class ModbusConnectionTimeoutError extends ModbusError {
  constructor(host, port, timeout) {
    super(`Connection timeout to ${host}:${port} after ${timeout}ms`);
    this.name = "ModbusConnectionTimeoutError";
  }
}
class ModbusNotConnectedError extends ModbusError {
  constructor() {
    super("Not connected to Modbus device");
    this.name = "ModbusNotConnectedError";
  }
}
class ModbusAlreadyConnectedError extends ModbusError {
  constructor() {
    super("Already connected to Modbus device");
    this.name = "ModbusAlreadyConnectedError";
  }
}
class ModbusBufferOverflowError extends ModbusError {
  constructor(size, max) {
    super(`Buffer overflow: ${size} bytes exceeds maximum ${max} bytes`);
    this.name = "ModbusBufferOverflowError";
  }
}
class ModbusInsufficientDataError extends ModbusResponseError {
  constructor(received, required) {
    super(`Insufficient data: received ${received} bytes, required ${required} bytes`);
    this.name = "ModbusInsufficientDataError";
  }
}
class ModbusDataConversionError extends ModbusError {
  constructor(data, expectedType) {
    super(`Cannot convert data "${data}" to ${expectedType}`);
    this.name = "ModbusDataConversionError";
  }
}
class ModbusGatewayPathUnavailableError extends ModbusError {
  constructor() {
    super("Gateway path unavailable");
    this.name = "ModbusGatewayPathUnavailableError";
  }
}
class ModbusGatewayTargetDeviceError extends ModbusError {
  constructor() {
    super("Gateway target device failed to respond");
    this.name = "ModbusGatewayTargetDeviceError";
  }
}
class ModbusInvalidStartingAddressError extends ModbusError {
  constructor(address) {
    super(`Invalid starting address: ${address}`);
    this.name = "ModbusInvalidStartingAddressError";
  }
}
class ModbusMemoryParityError extends ModbusError {
  constructor() {
    super("Memory parity error");
    this.name = "ModbusMemoryParityError";
  }
}
class ModbusLRCError extends ModbusError {
  constructor(message = "Modbus LRC check failed") {
    super(message);
    this.name = "ModbusLRCError";
  }
}
class ModbusChecksumError extends ModbusError {
  constructor(message = "Modbus checksum validation failed") {
    super(message);
    this.name = "ModbusChecksumError";
  }
}
class ModbusParityError extends ModbusError {
  constructor(message = "Modbus parity check failed") {
    super(message);
    this.name = "ModbusParityError";
  }
}
class ModbusSyncError extends ModbusError {
  constructor(message = "Modbus frame synchronization error") {
    super(message);
    this.name = "ModbusSyncError";
  }
}
class ModbusFrameBoundaryError extends ModbusError {
  constructor(message = "Modbus frame boundary detection error") {
    super(message);
    this.name = "ModbusFrameBoundaryError";
  }
}
class ModbusBufferUnderrunError extends ModbusError {
  constructor(size, required) {
    super(`Buffer underrun: ${size} bytes available, ${required} bytes needed`);
    this.name = "ModbusBufferUnderrunError";
  }
}
class ModbusCollisionError extends ModbusError {
  constructor(message = "Modbus communication collision detected") {
    super(message);
    this.name = "ModbusCollisionError";
  }
}
class ModbusNoiseError extends ModbusError {
  constructor(message = "Modbus communication affected by noise") {
    super(message);
    this.name = "ModbusNoiseError";
  }
}
class ModbusOverrunError extends ModbusError {
  constructor(message = "Modbus receiver overrun error") {
    super(message);
    this.name = "ModbusOverrunError";
  }
}
class ModbusFramingError extends ModbusError {
  constructor(message = "Modbus framing error") {
    super(message);
    this.name = "ModbusFramingError";
  }
}
class ModbusInterFrameTimeoutError extends ModbusError {
  constructor(message = "Modbus inter-frame timeout") {
    super(message);
    this.name = "ModbusInterFrameTimeoutError";
  }
}
class ModbusSilentIntervalError extends ModbusError {
  constructor(message = "Modbus silent interval violation") {
    super(message);
    this.name = "ModbusSilentIntervalError";
  }
}
class ModbusBaudRateError extends ModbusError {
  constructor(expected, actual) {
    super(`Baud rate mismatch: expected ${expected}, actual ${actual}`);
    this.name = "ModbusBaudRateError";
  }
}
class ModbusBroadcastError extends ModbusError {
  constructor(message = "Modbus broadcast operation failed") {
    super(message);
    this.name = "ModbusBroadcastError";
  }
}
class ModbusGatewayBusyError extends ModbusError {
  constructor() {
    super("Modbus gateway is busy");
    this.name = "ModbusGatewayBusyError";
  }
}
class ModbusDataOverrunError extends ModbusError {
  constructor() {
    super("Modbus data overrun error");
    this.name = "ModbusDataOverrunError";
  }
}
class ModbusConfigError extends ModbusError {
  constructor(message = "Modbus configuration error") {
    super(message);
    this.name = "ModbusConfigError";
  }
}
class ModbusMemoryError extends ModbusError {
  constructor(message = "Modbus memory access error") {
    super(message);
    this.name = "ModbusMemoryError";
  }
}
class ModbusStackOverflowError extends ModbusError {
  constructor(message = "Modbus stack overflow error") {
    super(message);
    this.name = "ModbusStackOverflowError";
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
  ModbusAcknowledgeError,
  ModbusAlreadyConnectedError,
  ModbusBaudRateError,
  ModbusBroadcastError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusCRCError,
  ModbusChecksumError,
  ModbusCollisionError,
  ModbusConfigError,
  ModbusConnectionRefusedError,
  ModbusConnectionTimeoutError,
  ModbusDataConversionError,
  ModbusDataOverrunError,
  ModbusError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusFrameBoundaryError,
  ModbusFramingError,
  ModbusGatewayBusyError,
  ModbusGatewayPathUnavailableError,
  ModbusGatewayTargetDeviceError,
  ModbusIllegalDataAddressError,
  ModbusIllegalDataValueError,
  ModbusInsufficientDataError,
  ModbusInterFrameTimeoutError,
  ModbusInvalidAddressError,
  ModbusInvalidFrameLengthError,
  ModbusInvalidFunctionCodeError,
  ModbusInvalidQuantityError,
  ModbusInvalidStartingAddressError,
  ModbusInvalidTransactionIdError,
  ModbusLRCError,
  ModbusMalformedFrameError,
  ModbusMemoryError,
  ModbusMemoryParityError,
  ModbusNoiseError,
  ModbusNotConnectedError,
  ModbusOverrunError,
  ModbusParityError,
  ModbusResponseError,
  ModbusSilentIntervalError,
  ModbusSlaveBusyError,
  ModbusSlaveDeviceFailureError,
  ModbusStackOverflowError,
  ModbusSyncError,
  ModbusTimeoutError,
  ModbusTooManyEmptyReadsError,
  ModbusUnexpectedFunctionCodeError,
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
