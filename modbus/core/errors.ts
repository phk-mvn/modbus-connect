// modbus/core/errors.ts

import { ModbusExceptionCode, MODBUS_EXCEPTION_MESSAGES } from '../constants/modbus.js';

/**
 * Base class for all Modbus-related errors.
 * All custom errors in this library extend from this class.
 */
export class ModbusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModbusError';
  }
}

/**
 * Thrown when a Modbus request exceeds the configured timeout period.
 */
export class ModbusTimeoutError extends ModbusError {
  constructor(message: string = 'Modbus request timed out') {
    super(message);
    this.name = 'ModbusTimeoutError';
  }
}

/**
 * Thrown when the CRC (Cyclic Redundancy Check) of a received Modbus frame is invalid.
 * Typically occurs in RTU mode due to transmission errors.
 */
export class ModbusCRCError extends ModbusError {
  constructor(message: string = 'Modbus CRC check failed') {
    super(message);
    this.name = 'ModbusCRCError';
  }
}

/**
 * Base class for errors related to invalid or malformed Modbus responses.
 */
export class ModbusResponseError extends ModbusError {
  constructor(message: string = 'Invalid Modbus response') {
    super(message);
    this.name = 'ModbusResponseError';
  }
}

/**
 * Thrown when the transport layer returns too many empty reads consecutively.
 * Often indicates a disconnected or unresponsive device.
 */
export class ModbusTooManyEmptyReadsError extends ModbusError {
  constructor(message: string = 'Too many empty reads from transport') {
    super(message);
    this.name = 'ModbusTooManyEmptyReadsError';
  }
}

/**
 * Thrown when the Modbus slave returns an exception response.
 * Contains the original function code and the exception code returned by the device.
 */
export class ModbusExceptionError extends ModbusError {
  /** The function code that was sent in the request */
  functionCode: number;
  /** The exception code returned by the slave */
  exceptionCode: number;

  /**
   * Creates a new ModbusExceptionError with a detailed message.
   * @param functionCode - The function code from the original request
   * @param exceptionCode - The exception code returned by the device
   */
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
 * Thrown when a Modbus operation is interrupted by a transport flush.
 * Commonly used in half-duplex RS485 scenarios to signal that pending data was discarded.
 */
export class ModbusFlushError extends ModbusError {
  constructor(message: string = 'Modbus operation interrupted by transport flush') {
    super(message);
    this.name = 'ModbusFlushError';
  }
}

// ─────────────────────────────────────────────────────────────
// Data Validation Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when an invalid Modbus address (slave ID or register/coil address) is provided.
 */
export class ModbusInvalidAddressError extends ModbusError {
  constructor(address: number) {
    super(`Invalid Modbus address: ${address}. Address must be between 1-255 for RTU/TCP.`);
    this.name = 'ModbusInvalidAddressError';
  }
}

/**
 * Thrown when an unsupported or invalid Modbus function code is used.
 */
export class ModbusInvalidFunctionCodeError extends ModbusError {
  constructor(functionCode: number) {
    super(`Invalid Modbus function code: 0x${functionCode.toString(16)}`);
    this.name = 'ModbusInvalidFunctionCodeError';
  }
}

/**
 * Thrown when the quantity of registers or coils is outside the allowed range for a given function.
 */
export class ModbusInvalidQuantityError extends ModbusError {
  constructor(quantity: number, min: number, max: number) {
    super(`Invalid quantity: ${quantity}. Must be between ${min}-${max}.`);
    this.name = 'ModbusInvalidQuantityError';
  }
}

/**
 * Represents the "Illegal Data Address" exception (Modbus exception code 0x02).
 */
export class ModbusIllegalDataAddressError extends ModbusError {
  constructor(address: number, quantity: number) {
    super(`Illegal data address: start=${address}, quantity=${quantity}`);
    this.name = 'ModbusIllegalDataAddressError';
  }
}

/**
 * Represents the "Illegal Data Value" exception (Modbus exception code 0x03).
 */
export class ModbusIllegalDataValueError extends ModbusError {
  constructor(value: number | string, expected: string) {
    super(`Illegal data value: ${value}, expected ${expected}`);
    this.name = 'ModbusIllegalDataValueError';
  }
}

/**
 * Represents the "Slave Device Busy" exception (Modbus exception code 0x06).
 */
export class ModbusSlaveBusyError extends ModbusError {
  constructor() {
    super('Slave device is busy');
    this.name = 'ModbusSlaveBusyError';
  }
}

/**
 * Represents the "Acknowledge" exception (Modbus exception code 0x05).
 * Indicates the slave has accepted the request but needs more time to process it.
 */
export class ModbusAcknowledgeError extends ModbusError {
  constructor() {
    super('Acknowledge received - device needs continued polling');
    this.name = 'ModbusAcknowledgeError';
  }
}

/**
 * Represents the "Slave Device Failure" exception (Modbus exception code 0x04).
 */
export class ModbusSlaveDeviceFailureError extends ModbusError {
  constructor() {
    super('Slave device failure');
    this.name = 'ModbusSlaveDeviceFailureError';
  }
}

// ─────────────────────────────────────────────────────────────
// Message Format & Parsing Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when a received Modbus frame cannot be parsed due to malformed structure.
 */
export class ModbusMalformedFrameError extends ModbusResponseError {
  constructor(rawData: Buffer | Uint8Array) {
    super(`Malformed Modbus frame received: ${Buffer.from(rawData).toString('hex')}`);
    this.name = 'ModbusMalformedFrameError';
  }
}

/**
 * Thrown when the length of a received Modbus frame is incorrect.
 */
export class ModbusInvalidFrameLengthError extends ModbusResponseError {
  constructor(received: number, expected: number) {
    super(`Invalid frame length: received ${received}, expected ${expected}`);
    this.name = 'ModbusInvalidFrameLengthError';
  }
}

/**
 * Thrown in Modbus TCP when the received transaction ID does not match the sent one.
 */
export class ModbusInvalidTransactionIdError extends ModbusResponseError {
  constructor(received: number, expected: number) {
    super(`Invalid transaction ID: received ${received}, expected ${expected}`);
    this.name = 'ModbusInvalidTransactionIdError';
  }
}

/**
 * Thrown when the function code in the response does not match the one sent in the request.
 */
export class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
  constructor(sent: number, received: number) {
    super(
      `Unexpected function code: sent 0x${sent.toString(16)}, received 0x${received.toString(16)}`
    );
    this.name = 'ModbusUnexpectedFunctionCodeError';
  }
}

// ─────────────────────────────────────────────────────────────
// Connection & Transport Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when the TCP connection is actively refused by the remote host.
 */
export class ModbusConnectionRefusedError extends ModbusError {
  constructor(host: string, port: number) {
    super(`Connection refused to ${host}:${port}`);
    this.name = 'ModbusConnectionRefusedError';
  }
}

/**
 * Thrown when a connection attempt to the Modbus device times out.
 */
export class ModbusConnectionTimeoutError extends ModbusError {
  constructor(host: string, port: number, timeout: number) {
    super(`Connection timeout to ${host}:${port} after ${timeout}ms`);
    this.name = 'ModbusConnectionTimeoutError';
  }
}

/**
 * Thrown when attempting to perform an operation while no transport connection is established.
 */
export class ModbusNotConnectedError extends ModbusError {
  constructor() {
    super('Not connected to Modbus device');
    this.name = 'ModbusNotConnectedError';
  }
}

/**
 * Thrown when attempting to connect while a connection is already active.
 */
export class ModbusAlreadyConnectedError extends ModbusError {
  constructor() {
    super('Already connected to Modbus device');
    this.name = 'ModbusAlreadyConnectedError';
  }
}

// ─────────────────────────────────────────────────────────────
// Buffer & Data Handling Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when data written to a buffer exceeds its maximum allowed size.
 */
export class ModbusBufferOverflowError extends ModbusError {
  constructor(size: number, max: number) {
    super(`Buffer overflow: ${size} bytes exceeds maximum ${max} bytes`);
    this.name = 'ModbusBufferOverflowError';
  }
}

/**
 * Thrown when not enough data has been received to complete parsing of a response.
 */
export class ModbusInsufficientDataError extends ModbusResponseError {
  constructor(received: number, required: number) {
    super(`Insufficient data: received ${received} bytes, required ${required} bytes`);
    this.name = 'ModbusInsufficientDataError';
  }
}

/**
 * Thrown when data cannot be converted to the expected type (e.g., buffer to number).
 */
export class ModbusDataConversionError extends ModbusError {
  constructor(data: unknown, expectedType: string) {
    super(`Cannot convert data "${data}" to ${expectedType}`);
    this.name = 'ModbusDataConversionError';
  }
}

// ─────────────────────────────────────────────────────────────
// Gateway & Advanced Exception Errors
// ─────────────────────────────────────────────────────────────

/**
 * Represents the "Gateway Path Unavailable" exception (Modbus exception code 0x0A).
 */
export class ModbusGatewayPathUnavailableError extends ModbusError {
  constructor() {
    super('Gateway path unavailable');
    this.name = 'ModbusGatewayPathUnavailableError';
  }
}

/**
 * Represents the "Gateway Target Device Failed to Respond" exception (Modbus exception code 0x0B).
 */
export class ModbusGatewayTargetDeviceError extends ModbusError {
  constructor() {
    super('Gateway target device failed to respond');
    this.name = 'ModbusGatewayTargetDeviceError';
  }
}

// ─────────────────────────────────────────────────────────────
// Additional Specific Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown for invalid starting addresses in read/write operations.
 */
export class ModbusInvalidStartingAddressError extends ModbusError {
  constructor(address: number) {
    super(`Invalid starting address: ${address}`);
    this.name = 'ModbusInvalidStartingAddressError';
  }
}

/**
 * Represents the "Memory Parity Error" exception (Modbus exception code 0x08).
 */
export class ModbusMemoryParityError extends ModbusError {
  constructor() {
    super('Memory parity error');
    this.name = 'ModbusMemoryParityError';
  }
}

/**
 * Thrown when LRC (Longitudinal Redundancy Check) validation fails (ASCII mode).
 */
export class ModbusLRCError extends ModbusError {
  constructor(message: string = 'Modbus LRC check failed') {
    super(message);
    this.name = 'ModbusLRCError';
  }
}

/**
 * Generic checksum validation failure.
 */
export class ModbusChecksumError extends ModbusError {
  constructor(message: string = 'Modbus checksum validation failed') {
    super(message);
    this.name = 'ModbusChecksumError';
  }
}

/**
 * Thrown when a parity error is detected on the serial line.
 */
export class ModbusParityError extends ModbusError {
  constructor(message: string = 'Modbus parity check failed') {
    super(message);
    this.name = 'ModbusParityError';
  }
}

/**
 * Thrown when frame synchronization is lost (e.g., missing start/end markers).
 */
export class ModbusSyncError extends ModbusError {
  constructor(message: string = 'Modbus frame synchronization error') {
    super(message);
    this.name = 'ModbusSyncError';
  }
}

/**
 * Thrown when frame boundary detection fails.
 */
export class ModbusFrameBoundaryError extends ModbusError {
  constructor(message: string = 'Modbus frame boundary detection error') {
    super(message);
    this.name = 'ModbusFrameBoundaryError';
  }
}

// ─────────────────────────────────────────────────────────────
// Transport & Communication Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when the receive buffer has insufficient data (underrun).
 */
export class ModbusBufferUnderrunError extends ModbusError {
  constructor(size: number, required: number) {
    super(`Buffer underrun: ${size} bytes available, ${required} bytes needed`);
    this.name = 'ModbusBufferUnderrunError';
  }
}

/**
 * Thrown when a communication collision is detected (e.g., in multi-master setups).
 */
export class ModbusCollisionError extends ModbusError {
  constructor(message: string = 'Modbus communication collision detected') {
    super(message);
    this.name = 'ModbusCollisionError';
  }
}

/**
 * Thrown when communication is affected by electrical noise.
 */
export class ModbusNoiseError extends ModbusError {
  constructor(message: string = 'Modbus communication affected by noise') {
    super(message);
    this.name = 'ModbusNoiseError';
  }
}

/**
 * Thrown when the receiver hardware overruns (data arrives faster than it can be processed).
 */
export class ModbusOverrunError extends ModbusError {
  constructor(message: string = 'Modbus receiver overrun error') {
    super(message);
    this.name = 'ModbusOverrunError';
  }
}

/**
 * Thrown when a framing error occurs on the serial line.
 */
export class ModbusFramingError extends ModbusError {
  constructor(message: string = 'Modbus framing error') {
    super(message);
    this.name = 'ModbusFramingError';
  }
}

// ─────────────────────────────────────────────────────────────
// Timing & Synchronization Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when the time between frames exceeds the allowed inter-frame timeout.
 */
export class ModbusInterFrameTimeoutError extends ModbusError {
  constructor(message: string = 'Modbus inter-frame timeout') {
    super(message);
    this.name = 'ModbusInterFrameTimeoutError';
  }
}

/**
 * Thrown when the silent interval (3.5 character times in RTU) is violated.
 */
export class ModbusSilentIntervalError extends ModbusError {
  constructor(message: string = 'Modbus silent interval violation') {
    super(message);
    this.name = 'ModbusSilentIntervalError';
  }
}

/**
 * Thrown when the configured baud rate does not match the actual rate.
 */
export class ModbusBaudRateError extends ModbusError {
  constructor(expected: number, actual: number) {
    super(`Baud rate mismatch: expected ${expected}, actual ${actual}`);
    this.name = 'ModbusBaudRateError';
  }
}

// ─────────────────────────────────────────────────────────────
// Protocol & Gateway Errors
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when a broadcast operation fails or is not supported in the current context.
 */
export class ModbusBroadcastError extends ModbusError {
  constructor(message: string = 'Modbus broadcast operation failed') {
    super(message);
    this.name = 'ModbusBroadcastError';
  }
}

/**
 * Thrown when the Modbus gateway is busy.
 */
export class ModbusGatewayBusyError extends ModbusError {
  constructor() {
    super('Modbus gateway is busy');
    this.name = 'ModbusGatewayBusyError';
  }
}

/**
 * Thrown on data overrun conditions.
 */
export class ModbusDataOverrunError extends ModbusError {
  constructor() {
    super('Modbus data overrun error');
    this.name = 'ModbusDataOverrunError';
  }
}

/**
 * Thrown for configuration-related errors in the Modbus stack.
 */
export class ModbusConfigError extends ModbusError {
  constructor(message: string = 'Modbus configuration error') {
    super(message);
    this.name = 'ModbusConfigError';
  }
}

/**
 * Generic memory access error.
 */
export class ModbusMemoryError extends ModbusError {
  constructor(message: string = 'Modbus memory access error') {
    super(message);
    this.name = 'ModbusMemoryError';
  }
}

/**
 * Thrown when a stack overflow is detected in low-level operations.
 */
export class ModbusStackOverflowError extends ModbusError {
  constructor(message: string = 'Modbus stack overflow error') {
    super(message);
    this.name = 'ModbusStackOverflowError';
  }
}

// ─────────────────────────────────────────────────────────────
// Transport Layer Errors
// ─────────────────────────────────────────────────────────────

/**
 * Base class for all transport-specific errors.
 */
export class TransportError extends ModbusError {
  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
  }
}

/**
 * Base class for Web Serial transport errors.
 */
export class WebSerialTransportError extends TransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialTransportError';
  }
}

/**
 * Thrown when a connection error occurs with Web Serial API.
 */
export class WebSerialConnectionError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialConnectionError';
  }
}

/**
 * Thrown when a read operation fails on Web Serial transport.
 */
export class WebSerialReadError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialReadError';
  }
}

/**
 * Thrown when a write operation fails on Web Serial transport.
 */
export class WebSerialWriteError extends WebSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'WebSerialWriteError';
  }
}

/**
 * Base class for Node.js serial transport errors.
 */
export class NodeSerialTransportError extends TransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialTransportError';
  }
}

/**
 * Thrown when a connection error occurs with Node.js serial port.
 */
export class NodeSerialConnectionError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialConnectionError';
  }
}

/**
 * Thrown when a read operation fails on Node.js serial transport.
 */
export class NodeSerialReadError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialReadError';
  }
}

/**
 * Thrown when a write operation fails on Node.js serial transport.
 */
export class NodeSerialWriteError extends NodeSerialTransportError {
  constructor(message: string) {
    super(message);
    this.name = 'NodeSerialWriteError';
  }
}

// ─────────────────────────────────────────────────────────────
// Polling Manager Errors
// ─────────────────────────────────────────────────────────────

/**
 * Base class for all PollingManager-related errors.
 */
export class PollingManagerError extends ModbusError {
  constructor(message: string) {
    super(message);
    this.name = 'PollingManagerError';
  }
}

/**
 * Thrown when attempting to add a task with an ID that already exists.
 */
export class PollingTaskAlreadyExistsError extends PollingManagerError {
  constructor(id: string) {
    super(`Polling task with id "${id}" already exists.`);
    this.name = 'PollingTaskAlreadyExistsError';
  }
}

/**
 * Thrown when a requested task ID is not found in the PollingManager.
 */
export class PollingTaskNotFoundError extends PollingManagerError {
  constructor(id: string) {
    super(`Polling task with id "${id}" does not exist.`);
    this.name = 'PollingTaskNotFoundError';
  }
}

/**
 * Thrown when task options fail validation (missing id, invalid interval, etc.).
 */
export class PollingTaskValidationError extends PollingManagerError {
  constructor(message: string) {
    super(message);
    this.name = 'PollingTaskValidationError';
  }
}

/**
 * Thrown when an operation violates RS485/RS232 mode constraints.
 */
export class RSModeConstraintError extends ModbusError {
  constructor(message: string) {
    super(message);
    this.name = 'RSModeConstraintError';
  }
}
