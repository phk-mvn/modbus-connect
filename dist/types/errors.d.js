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
class ModbusInvalidAddressError extends ModbusError {
}
class ModbusInvalidFunctionCodeError extends ModbusError {
}
class ModbusInvalidQuantityError extends ModbusError {
}
class ModbusIllegalDataAddressError extends ModbusError {
}
class ModbusIllegalDataValueError extends ModbusError {
}
class ModbusSlaveBusyError extends ModbusError {
}
class ModbusAcknowledgeError extends ModbusError {
}
class ModbusSlaveDeviceFailureError extends ModbusError {
}
class ModbusMalformedFrameError extends ModbusResponseError {
}
class ModbusInvalidFrameLengthError extends ModbusResponseError {
}
class ModbusInvalidTransactionIdError extends ModbusResponseError {
}
class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
}
class ModbusConnectionRefusedError extends ModbusError {
}
class ModbusConnectionTimeoutError extends ModbusError {
}
class ModbusNotConnectedError extends ModbusError {
}
class ModbusAlreadyConnectedError extends ModbusError {
}
class ModbusBufferOverflowError extends ModbusError {
}
class ModbusInsufficientDataError extends ModbusResponseError {
}
class ModbusDataConversionError extends ModbusError {
}
class ModbusGatewayPathUnavailableError extends ModbusError {
}
class ModbusGatewayTargetDeviceError extends ModbusError {
}
class ModbusInvalidStartingAddressError extends ModbusError {
}
class ModbusMemoryParityError extends ModbusError {
}
class ModbusLRCError extends ModbusError {
}
class ModbusChecksumError extends ModbusError {
}
class ModbusParityError extends ModbusError {
}
class ModbusSyncError extends ModbusError {
}
class ModbusFrameBoundaryError extends ModbusError {
}
class ModbusBufferUnderrunError extends ModbusError {
}
class ModbusCollisionError extends ModbusError {
}
class ModbusNoiseError extends ModbusError {
}
class ModbusOverrunError extends ModbusError {
}
class ModbusFramingError extends ModbusError {
}
class ModbusInterFrameTimeoutError extends ModbusError {
}
class ModbusSilentIntervalError extends ModbusError {
}
class ModbusBaudRateError extends ModbusError {
}
class ModbusBroadcastError extends ModbusError {
}
class ModbusGatewayBusyError extends ModbusError {
}
class ModbusDataOverrunError extends ModbusError {
}
class ModbusConfigError extends ModbusError {
}
class ModbusMemoryError extends ModbusError {
}
class ModbusStackOverflowError extends ModbusError {
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
