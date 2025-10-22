// src/errors.ts

import { ModbusExceptionCode, MODBUS_EXCEPTION_MESSAGES } from './constants/constants.js';

/**
 * Base class for all Modbus errors
 */
export class ModbusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModbusError';
  }
}

/**
 * Error class for Modbus timeout
 */
export class ModbusTimeoutError extends ModbusError {
  constructor(message: string = 'Modbus request timed out') {
    super(message);
    this.name = 'ModbusTimeoutError';
  }
}

/**
 * Error class for Modbus CRC check failure
 */
export class ModbusCRCError extends ModbusError {
  constructor(message: string = 'Modbus CRC check failed') {
    super(message);
    this.name = 'ModbusCRCError';
  }
}

/**
 * Error class for Modbus response errors
 */
export class ModbusResponseError extends ModbusError {
  constructor(message: string = 'Invalid Modbus response') {
    super(message);
    this.name = 'ModbusResponseError';
  }
}

/**
 * Error class for Modbus too many empty reads
 */
export class ModbusTooManyEmptyReadsError extends ModbusError {
  constructor(message: string = 'Too many empty reads from transport') {
    super(message);
    this.name = 'ModbusTooManyEmptyReadsError';
  }
}

/**
 * Error class for Modbus exception
 */
export class ModbusExceptionError extends ModbusError {
  functionCode: number;
  exceptionCode: number;

  constructor(functionCode: number, exceptionCode: number) {
    const exceptionMessage =
      MODBUS_EXCEPTION_MESSAGES[exceptionCode as ModbusExceptionCode] ||
      `Unknown exception code: ${exceptionCode}`;
    super(
      `Modbus exception: function 0x${functionCode.toString(16)}, code 0x${exceptionCode.toString(16)} (${exceptionMessage})`
    );
    this.name = 'ModbusExceptionError';
    this.functionCode = functionCode;
    this.exceptionCode = exceptionCode;
  }
}

/**
 * Error class for Modbus flush error
 */
export class ModbusFlushError extends ModbusError {
  constructor(message: string = 'Modbus operation interrupted by transport flush') {
    super(message);
    this.name = 'ModbusFlushError';
  }
}

// --- Errors for Data Validation ---

/**
 * Error class for invalid Modbus address
 */
export class ModbusInvalidAddressError extends ModbusError {
  constructor(address: number) {
    super(`Invalid Modbus address: ${address}. Address must be between 0-247 for RTU/TCP.`);
    this.name = 'ModbusInvalidAddressError';
  }
}

/**
 * Error class for invalid function code
 */
export class ModbusInvalidFunctionCodeError extends ModbusError {
  constructor(functionCode: number) {
    super(`Invalid Modbus function code: 0x${functionCode.toString(16)}`);
    this.name = 'ModbusInvalidFunctionCodeError';
  }
}

/**
 * Error class for invalid quantity (register/coil count)
 */
export class ModbusInvalidQuantityError extends ModbusError {
  constructor(quantity: number, min: number, max: number) {
    super(`Invalid quantity: ${quantity}. Must be between ${min}-${max}.`);
    this.name = 'ModbusInvalidQuantityError';
  }
}

/**
 * Error class for illegal data address exception
 */
export class ModbusIllegalDataAddressError extends ModbusError {
  constructor(address: number, quantity: number) {
    super(`Illegal data address: start=${address}, quantity=${quantity}`);
    this.name = 'ModbusIllegalDataAddressError';
  }
}

/**
 * Error class for illegal data value exception
 */
export class ModbusIllegalDataValueError extends ModbusError {
  constructor(value: number | string, expected: string) {
    super(`Illegal data value: ${value}, expected ${expected}`);
    this.name = 'ModbusIllegalDataValueError';
  }
}

/**
 * Error class for slave device busy exception
 */
export class ModbusSlaveBusyError extends ModbusError {
  constructor() {
    super('Slave device is busy');
    this.name = 'ModbusSlaveBusyError';
  }
}

/**
 * Error class for acknowledge exception
 */
export class ModbusAcknowledgeError extends ModbusError {
  constructor() {
    super('Acknowledge received - device needs continued polling');
    this.name = 'ModbusAcknowledgeError';
  }
}

/**
 * Error class for slave device failure exception
 */
export class ModbusSlaveDeviceFailureError extends ModbusError {
  constructor() {
    super('Slave device failure');
    this.name = 'ModbusSlaveDeviceFailureError';
  }
}

// --- Errors for Message Format ---

/**
 * Error class for malformed Modbus frame
 */
export class ModbusMalformedFrameError extends ModbusResponseError {
  constructor(rawData: Buffer | Uint8Array) {
    super(`Malformed Modbus frame received: ${Buffer.from(rawData).toString('hex')}`);
    this.name = 'ModbusMalformedFrameError';
  }
}

/**
 * Error class for invalid frame length
 */
export class ModbusInvalidFrameLengthError extends ModbusResponseError {
  constructor(received: number, expected: number) {
    super(`Invalid frame length: received ${received}, expected ${expected}`);
    this.name = 'ModbusInvalidFrameLengthError';
  }
}

/**
 * Error class for invalid Modbus transaction ID
 */
export class ModbusInvalidTransactionIdError extends ModbusResponseError {
  constructor(received: number, expected: number) {
    super(`Invalid transaction ID: received ${received}, expected ${expected}`);
    this.name = 'ModbusInvalidTransactionIdError';
  }
}

/**
 * Error class for unexpected function code in response
 */
export class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
  constructor(sent: number, received: number) {
    super(
      `Unexpected function code: sent 0x${sent.toString(16)}, received 0x${received.toString(16)}`
    );
    this.name = 'ModbusUnexpectedFunctionCodeError';
  }
}

// --- Errors for Connection and Transport ---

/**
 * Error class for connection refused
 */
export class ModbusConnectionRefusedError extends ModbusError {
  constructor(host: string, port: number) {
    super(`Connection refused to ${host}:${port}`);
    this.name = 'ModbusConnectionRefusedError';
  }
}

/**
 * Error class for connection timeout
 */
export class ModbusConnectionTimeoutError extends ModbusError {
  constructor(host: string, port: number, timeout: number) {
    super(`Connection timeout to ${host}:${port} after ${timeout}ms`);
    this.name = 'ModbusConnectionTimeoutError';
  }
}

/**
 * Error class for not connected
 */
export class ModbusNotConnectedError extends ModbusError {
  constructor() {
    super('Not connected to Modbus device');
    this.name = 'ModbusNotConnectedError';
  }
}

/**
 * Error class for already connected
 */
export class ModbusAlreadyConnectedError extends ModbusError {
  constructor() {
    super('Already connected to Modbus device');
    this.name = 'ModbusAlreadyConnectedError';
  }
}

// --- Errors for Buffer and Data ---

/**
 * Error class for buffer overflow
 */
export class ModbusBufferOverflowError extends ModbusError {
  constructor(size: number, max: number) {
    super(`Buffer overflow: ${size} bytes exceeds maximum ${max} bytes`);
    this.name = 'ModbusBufferOverflowError';
  }
}

/**
 * Error class for insufficient data
 */
export class ModbusInsufficientDataError extends ModbusResponseError {
  constructor(received: number, required: number) {
    super(`Insufficient data: received ${received} bytes, required ${required} bytes`);
    this.name = 'ModbusInsufficientDataError';
  }
}

/**
 * Error class for data type conversion errors
 */
export class ModbusDataConversionError extends ModbusError {
  constructor(data: any, expectedType: string) {
    super(`Cannot convert data "${data}" to ${expectedType}`);
    this.name = 'ModbusDataConversionError';
  }
}

// --- Errors for Security and Access ---

/**
 * Error class for gateway path unavailable
 */
export class ModbusGatewayPathUnavailableError extends ModbusError {
  constructor() {
    super('Gateway path unavailable');
    this.name = 'ModbusGatewayPathUnavailableError';
  }
}

/**
 * Error class for gateway target device failed to respond
 */
export class ModbusGatewayTargetDeviceError extends ModbusError {
  constructor() {
    super('Gateway target device failed to respond');
    this.name = 'ModbusGatewayTargetDeviceError';
  }
}

// --- Errors for Specific Functions ---

/**
 * Error class for invalid starting address in read operations
 */
export class ModbusInvalidStartingAddressError extends ModbusError {
  constructor(address: number) {
    super(`Invalid starting address: ${address}`);
    this.name = 'ModbusInvalidStartingAddressError';
  }
}

/**
 * Error class for memory parity error (function code 8)
 */
export class ModbusMemoryParityError extends ModbusError {
  constructor() {
    super('Memory parity error');
    this.name = 'ModbusMemoryParityError';
  }
}

// --- Additional Integrity and Checksum Errors ---

/**
 * Error class for Modbus LRC (Longitudinal Redundancy Check) failure
 */
export class ModbusLRCError extends ModbusError {
  constructor(message: string = 'Modbus LRC check failed') {
    super(message);
    this.name = 'ModbusLRCError';
  }
}

/**
 * Error class for Modbus checksum validation failure
 */
export class ModbusChecksumError extends ModbusError {
  constructor(message: string = 'Modbus checksum validation failed') {
    super(message);
    this.name = 'ModbusChecksumError';
  }
}

/**
 * Error class for Modbus parity bit error
 */
export class ModbusParityError extends ModbusError {
  constructor(message: string = 'Modbus parity check failed') {
    super(message);
    this.name = 'ModbusParityError';
  }
}

/**
 * Error class for Modbus frame synchronization error
 */
export class ModbusSyncError extends ModbusError {
  constructor(message: string = 'Modbus frame synchronization error') {
    super(message);
    this.name = 'ModbusSyncError';
  }
}

/**
 * Error class for Modbus frame boundary detection error
 */
export class ModbusFrameBoundaryError extends ModbusError {
  constructor(message: string = 'Modbus frame boundary detection error') {
    super(message);
    this.name = 'ModbusFrameBoundaryError';
  }
}

// --- Additional Transport and Communication Errors ---

/**
 * Error class for Modbus buffer underrun
 */
export class ModbusBufferUnderrunError extends ModbusError {
  constructor(size: number, required: number) {
    super(`Buffer underrun: ${size} bytes available, ${required} bytes needed`);
    this.name = 'ModbusBufferUnderrunError';
  }
}

/**
 * Error class for Modbus communication collision
 */
export class ModbusCollisionError extends ModbusError {
  constructor(message: string = 'Modbus communication collision detected') {
    super(message);
    this.name = 'ModbusCollisionError';
  }
}

/**
 * Error class for Modbus noise error
 */
export class ModbusNoiseError extends ModbusError {
  constructor(message: string = 'Modbus communication affected by noise') {
    super(message);
    this.name = 'ModbusNoiseError';
  }
}

/**
 * Error class for Modbus overrun error
 */
export class ModbusOverrunError extends ModbusError {
  constructor(message: string = 'Modbus receiver overrun error') {
    super(message);
    this.name = 'ModbusOverrunError';
  }
}

/**
 * Error class for Modbus framing error
 */
export class ModbusFramingError extends ModbusError {
  constructor(message: string = 'Modbus framing error') {
    super(message);
    this.name = 'ModbusFramingError';
  }
}

// --- Additional Timing and Synchronization Errors ---

/**
 * Error class for Modbus inter-frame timeout
 */
export class ModbusInterFrameTimeoutError extends ModbusError {
  constructor(message: string = 'Modbus inter-frame timeout') {
    super(message);
    this.name = 'ModbusInterFrameTimeoutError';
  }
}

/**
 * Error class for Modbus silent interval violation
 */
export class ModbusSilentIntervalError extends ModbusError {
  constructor(message: string = 'Modbus silent interval violation') {
    super(message);
    this.name = 'ModbusSilentIntervalError';
  }
}

/**
 * Error class for Modbus baud rate configuration error
 */
export class ModbusBaudRateError extends ModbusError {
  constructor(expected: number, actual: number) {
    super(`Baud rate mismatch: expected ${expected}, actual ${actual}`);
    this.name = 'ModbusBaudRateError';
  }
}

// --- Additional Protocol-Specific Errors ---

/**
 * Error class for Modbus broadcast operation error
 */
export class ModbusBroadcastError extends ModbusError {
  constructor(message: string = 'Modbus broadcast operation failed') {
    super(message);
    this.name = 'ModbusBroadcastError';
  }
}

/**
 * Error class for Modbus gateway busy error
 */
export class ModbusGatewayBusyError extends ModbusError {
  constructor() {
    super('Modbus gateway is busy');
    this.name = 'ModbusGatewayBusyError';
  }
}

/**
 * Error class for Modbus data overrun error
 */
export class ModbusDataOverrunError extends ModbusError {
  constructor() {
    super('Modbus data overrun error');
    this.name = 'ModbusDataOverrunError';
  }
}

/**
 * Error class for Modbus configuration error
 */
export class ModbusConfigError extends ModbusError {
  constructor(message: string = 'Modbus configuration error') {
    super(message);
    this.name = 'ModbusConfigError';
  }
}

// --- Additional Memory and Buffer Errors ---

/**
 * Error class for Modbus memory error
 */
export class ModbusMemoryError extends ModbusError {
  constructor(message: string = 'Modbus memory access error') {
    super(message);
    this.name = 'ModbusMemoryError';
  }
}

/**
 * Error class for Modbus stack overflow error
 */
export class ModbusStackOverflowError extends ModbusError {
  constructor(message: string = 'Modbus stack overflow error') {
    super(message);
    this.name = 'ModbusStackOverflowError';
  }
}

// --- Errors for Transports ---

/**
 * Base class for all Transport errors
 */
export class TransportError extends ModbusError {
  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
  }
}

/**
 * Error class for Web Serial transport errors
 */
export class WebSerialTransportError extends TransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialTransportError';
  }
}

/**
 * Error class for Web Serial connection errors
 */
export class WebSerialConnectionError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialConnectionError';
  }
}

/**
 * Error class for Web Serial read errors
 */
export class WebSerialReadError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialReadError';
  }
}

/**
 * Error class for Web Serial write errors
 */
export class WebSerialWriteError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialWriteError';
  }
}

/**
 * Error class for Node Serial transport errors
 */
export class NodeSerialTransportError extends TransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialTransportError';
  }
}

/**
 * Error class for Node Serial connection errors
 */
export class NodeSerialConnectionError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialConnectionError';
  }
}

/**
 * Error class for Node Serial read errors
 */
export class NodeSerialReadError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialReadError';
  }
}

/**
 * Error class for Node Serial write errors
 */
export class NodeSerialWriteError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialWriteError';
  }
}

export class PollingManagerError extends ModbusError {
  constructor(message: string) {
    super(message);
    this.name = 'PollingManagerError';
  }
}

export class PollingTaskAlreadyExistsError extends PollingManagerError {
  constructor(id: string) {
    super(`Polling task with id "${id}" already exists.`);
    this.name = 'PollingTaskAlreadyExistsError';
  }
}

export class PollingTaskNotFoundError extends PollingManagerError {
  constructor(id: string) {
    super(`Polling task with id "${id}" does not exist.`);
    this.name = 'PollingTaskNotFoundError';
  }
}

export class PollingTaskValidationError extends PollingManagerError {
  constructor(message: string) {
    super(message);
    this.name = 'PollingTaskValidationError';
  }
}
