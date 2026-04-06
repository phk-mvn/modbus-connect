"use strict";
// modbus/errors.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportError = exports.ModbusStackOverflowError = exports.ModbusMemoryError = exports.ModbusConfigError = exports.ModbusDataOverrunError = exports.ModbusGatewayBusyError = exports.ModbusBroadcastError = exports.ModbusBaudRateError = exports.ModbusSilentIntervalError = exports.ModbusInterFrameTimeoutError = exports.ModbusFramingError = exports.ModbusOverrunError = exports.ModbusNoiseError = exports.ModbusCollisionError = exports.ModbusBufferUnderrunError = exports.ModbusFrameBoundaryError = exports.ModbusSyncError = exports.ModbusParityError = exports.ModbusChecksumError = exports.ModbusLRCError = exports.ModbusMemoryParityError = exports.ModbusInvalidStartingAddressError = exports.ModbusGatewayTargetDeviceError = exports.ModbusGatewayPathUnavailableError = exports.ModbusDataConversionError = exports.ModbusInsufficientDataError = exports.ModbusBufferOverflowError = exports.ModbusAlreadyConnectedError = exports.ModbusNotConnectedError = exports.ModbusConnectionTimeoutError = exports.ModbusConnectionRefusedError = exports.ModbusUnexpectedFunctionCodeError = exports.ModbusInvalidTransactionIdError = exports.ModbusInvalidFrameLengthError = exports.ModbusMalformedFrameError = exports.ModbusSlaveDeviceFailureError = exports.ModbusAcknowledgeError = exports.ModbusSlaveBusyError = exports.ModbusIllegalDataValueError = exports.ModbusIllegalDataAddressError = exports.ModbusInvalidQuantityError = exports.ModbusInvalidFunctionCodeError = exports.ModbusInvalidAddressError = exports.ModbusFlushError = exports.ModbusExceptionError = exports.ModbusTooManyEmptyReadsError = exports.ModbusResponseError = exports.ModbusCRCError = exports.ModbusTimeoutError = exports.ModbusError = void 0;
exports.RSModeConstraintError = exports.PollingTaskValidationError = exports.PollingTaskNotFoundError = exports.PollingTaskAlreadyExistsError = exports.PollingManagerError = exports.NodeSerialWriteError = exports.NodeSerialReadError = exports.NodeSerialConnectionError = exports.NodeSerialTransportError = exports.WebSerialWriteError = exports.WebSerialReadError = exports.WebSerialConnectionError = exports.WebSerialTransportError = void 0;
const constants_js_1 = require("./constants/constants.js");
/**
 * Base class for all Modbus-related errors.
 * All custom errors in this library extend from this class.
 */
class ModbusError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ModbusError';
    }
}
exports.ModbusError = ModbusError;
/**
 * Thrown when a Modbus request exceeds the configured timeout period.
 */
class ModbusTimeoutError extends ModbusError {
    constructor(message = 'Modbus request timed out') {
        super(message);
        this.name = 'ModbusTimeoutError';
    }
}
exports.ModbusTimeoutError = ModbusTimeoutError;
/**
 * Thrown when the CRC (Cyclic Redundancy Check) of a received Modbus frame is invalid.
 * Typically occurs in RTU mode due to transmission errors.
 */
class ModbusCRCError extends ModbusError {
    constructor(message = 'Modbus CRC check failed') {
        super(message);
        this.name = 'ModbusCRCError';
    }
}
exports.ModbusCRCError = ModbusCRCError;
/**
 * Base class for errors related to invalid or malformed Modbus responses.
 */
class ModbusResponseError extends ModbusError {
    constructor(message = 'Invalid Modbus response') {
        super(message);
        this.name = 'ModbusResponseError';
    }
}
exports.ModbusResponseError = ModbusResponseError;
/**
 * Thrown when the transport layer returns too many empty reads consecutively.
 * Often indicates a disconnected or unresponsive device.
 */
class ModbusTooManyEmptyReadsError extends ModbusError {
    constructor(message = 'Too many empty reads from transport') {
        super(message);
        this.name = 'ModbusTooManyEmptyReadsError';
    }
}
exports.ModbusTooManyEmptyReadsError = ModbusTooManyEmptyReadsError;
/**
 * Thrown when the Modbus slave returns an exception response.
 * Contains the original function code and the exception code returned by the device.
 */
class ModbusExceptionError extends ModbusError {
    /** The function code that was sent in the request */
    functionCode;
    /** The exception code returned by the slave */
    exceptionCode;
    /**
     * Creates a new ModbusExceptionError with a detailed message.
     * @param functionCode - The function code from the original request
     * @param exceptionCode - The exception code returned by the device
     */
    constructor(functionCode, exceptionCode) {
        const exceptionMessage = constants_js_1.MODBUS_EXCEPTION_MESSAGES[exceptionCode] ||
            `Unknown exception code: ${exceptionCode}`;
        super(`Modbus exception: function 0x${functionCode.toString(16)}, code 0x${exceptionCode.toString(16)} (${exceptionMessage})`);
        this.name = 'ModbusExceptionError';
        this.functionCode = functionCode;
        this.exceptionCode = exceptionCode;
    }
}
exports.ModbusExceptionError = ModbusExceptionError;
/**
 * Thrown when a Modbus operation is interrupted by a transport flush.
 * Commonly used in half-duplex RS485 scenarios to signal that pending data was discarded.
 */
class ModbusFlushError extends ModbusError {
    constructor(message = 'Modbus operation interrupted by transport flush') {
        super(message);
        this.name = 'ModbusFlushError';
    }
}
exports.ModbusFlushError = ModbusFlushError;
// ─────────────────────────────────────────────────────────────
// Data Validation Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when an invalid Modbus address (slave ID or register/coil address) is provided.
 */
class ModbusInvalidAddressError extends ModbusError {
    constructor(address) {
        super(`Invalid Modbus address: ${address}. Address must be between 1-255 for RTU/TCP.`);
        this.name = 'ModbusInvalidAddressError';
    }
}
exports.ModbusInvalidAddressError = ModbusInvalidAddressError;
/**
 * Thrown when an unsupported or invalid Modbus function code is used.
 */
class ModbusInvalidFunctionCodeError extends ModbusError {
    constructor(functionCode) {
        super(`Invalid Modbus function code: 0x${functionCode.toString(16)}`);
        this.name = 'ModbusInvalidFunctionCodeError';
    }
}
exports.ModbusInvalidFunctionCodeError = ModbusInvalidFunctionCodeError;
/**
 * Thrown when the quantity of registers or coils is outside the allowed range for a given function.
 */
class ModbusInvalidQuantityError extends ModbusError {
    constructor(quantity, min, max) {
        super(`Invalid quantity: ${quantity}. Must be between ${min}-${max}.`);
        this.name = 'ModbusInvalidQuantityError';
    }
}
exports.ModbusInvalidQuantityError = ModbusInvalidQuantityError;
/**
 * Represents the "Illegal Data Address" exception (Modbus exception code 0x02).
 */
class ModbusIllegalDataAddressError extends ModbusError {
    constructor(address, quantity) {
        super(`Illegal data address: start=${address}, quantity=${quantity}`);
        this.name = 'ModbusIllegalDataAddressError';
    }
}
exports.ModbusIllegalDataAddressError = ModbusIllegalDataAddressError;
/**
 * Represents the "Illegal Data Value" exception (Modbus exception code 0x03).
 */
class ModbusIllegalDataValueError extends ModbusError {
    constructor(value, expected) {
        super(`Illegal data value: ${value}, expected ${expected}`);
        this.name = 'ModbusIllegalDataValueError';
    }
}
exports.ModbusIllegalDataValueError = ModbusIllegalDataValueError;
/**
 * Represents the "Slave Device Busy" exception (Modbus exception code 0x06).
 */
class ModbusSlaveBusyError extends ModbusError {
    constructor() {
        super('Slave device is busy');
        this.name = 'ModbusSlaveBusyError';
    }
}
exports.ModbusSlaveBusyError = ModbusSlaveBusyError;
/**
 * Represents the "Acknowledge" exception (Modbus exception code 0x05).
 * Indicates the slave has accepted the request but needs more time to process it.
 */
class ModbusAcknowledgeError extends ModbusError {
    constructor() {
        super('Acknowledge received - device needs continued polling');
        this.name = 'ModbusAcknowledgeError';
    }
}
exports.ModbusAcknowledgeError = ModbusAcknowledgeError;
/**
 * Represents the "Slave Device Failure" exception (Modbus exception code 0x04).
 */
class ModbusSlaveDeviceFailureError extends ModbusError {
    constructor() {
        super('Slave device failure');
        this.name = 'ModbusSlaveDeviceFailureError';
    }
}
exports.ModbusSlaveDeviceFailureError = ModbusSlaveDeviceFailureError;
// ─────────────────────────────────────────────────────────────
// Message Format & Parsing Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when a received Modbus frame cannot be parsed due to malformed structure.
 */
class ModbusMalformedFrameError extends ModbusResponseError {
    constructor(rawData) {
        super(`Malformed Modbus frame received: ${Buffer.from(rawData).toString('hex')}`);
        this.name = 'ModbusMalformedFrameError';
    }
}
exports.ModbusMalformedFrameError = ModbusMalformedFrameError;
/**
 * Thrown when the length of a received Modbus frame is incorrect.
 */
class ModbusInvalidFrameLengthError extends ModbusResponseError {
    constructor(received, expected) {
        super(`Invalid frame length: received ${received}, expected ${expected}`);
        this.name = 'ModbusInvalidFrameLengthError';
    }
}
exports.ModbusInvalidFrameLengthError = ModbusInvalidFrameLengthError;
/**
 * Thrown in Modbus TCP when the received transaction ID does not match the sent one.
 */
class ModbusInvalidTransactionIdError extends ModbusResponseError {
    constructor(received, expected) {
        super(`Invalid transaction ID: received ${received}, expected ${expected}`);
        this.name = 'ModbusInvalidTransactionIdError';
    }
}
exports.ModbusInvalidTransactionIdError = ModbusInvalidTransactionIdError;
/**
 * Thrown when the function code in the response does not match the one sent in the request.
 */
class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
    constructor(sent, received) {
        super(`Unexpected function code: sent 0x${sent.toString(16)}, received 0x${received.toString(16)}`);
        this.name = 'ModbusUnexpectedFunctionCodeError';
    }
}
exports.ModbusUnexpectedFunctionCodeError = ModbusUnexpectedFunctionCodeError;
// ─────────────────────────────────────────────────────────────
// Connection & Transport Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when the TCP connection is actively refused by the remote host.
 */
class ModbusConnectionRefusedError extends ModbusError {
    constructor(host, port) {
        super(`Connection refused to ${host}:${port}`);
        this.name = 'ModbusConnectionRefusedError';
    }
}
exports.ModbusConnectionRefusedError = ModbusConnectionRefusedError;
/**
 * Thrown when a connection attempt to the Modbus device times out.
 */
class ModbusConnectionTimeoutError extends ModbusError {
    constructor(host, port, timeout) {
        super(`Connection timeout to ${host}:${port} after ${timeout}ms`);
        this.name = 'ModbusConnectionTimeoutError';
    }
}
exports.ModbusConnectionTimeoutError = ModbusConnectionTimeoutError;
/**
 * Thrown when attempting to perform an operation while no transport connection is established.
 */
class ModbusNotConnectedError extends ModbusError {
    constructor() {
        super('Not connected to Modbus device');
        this.name = 'ModbusNotConnectedError';
    }
}
exports.ModbusNotConnectedError = ModbusNotConnectedError;
/**
 * Thrown when attempting to connect while a connection is already active.
 */
class ModbusAlreadyConnectedError extends ModbusError {
    constructor() {
        super('Already connected to Modbus device');
        this.name = 'ModbusAlreadyConnectedError';
    }
}
exports.ModbusAlreadyConnectedError = ModbusAlreadyConnectedError;
// ─────────────────────────────────────────────────────────────
// Buffer & Data Handling Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when data written to a buffer exceeds its maximum allowed size.
 */
class ModbusBufferOverflowError extends ModbusError {
    constructor(size, max) {
        super(`Buffer overflow: ${size} bytes exceeds maximum ${max} bytes`);
        this.name = 'ModbusBufferOverflowError';
    }
}
exports.ModbusBufferOverflowError = ModbusBufferOverflowError;
/**
 * Thrown when not enough data has been received to complete parsing of a response.
 */
class ModbusInsufficientDataError extends ModbusResponseError {
    constructor(received, required) {
        super(`Insufficient data: received ${received} bytes, required ${required} bytes`);
        this.name = 'ModbusInsufficientDataError';
    }
}
exports.ModbusInsufficientDataError = ModbusInsufficientDataError;
/**
 * Thrown when data cannot be converted to the expected type (e.g., buffer to number).
 */
class ModbusDataConversionError extends ModbusError {
    constructor(data, expectedType) {
        super(`Cannot convert data "${data}" to ${expectedType}`);
        this.name = 'ModbusDataConversionError';
    }
}
exports.ModbusDataConversionError = ModbusDataConversionError;
// ─────────────────────────────────────────────────────────────
// Gateway & Advanced Exception Errors
// ─────────────────────────────────────────────────────────────
/**
 * Represents the "Gateway Path Unavailable" exception (Modbus exception code 0x0A).
 */
class ModbusGatewayPathUnavailableError extends ModbusError {
    constructor() {
        super('Gateway path unavailable');
        this.name = 'ModbusGatewayPathUnavailableError';
    }
}
exports.ModbusGatewayPathUnavailableError = ModbusGatewayPathUnavailableError;
/**
 * Represents the "Gateway Target Device Failed to Respond" exception (Modbus exception code 0x0B).
 */
class ModbusGatewayTargetDeviceError extends ModbusError {
    constructor() {
        super('Gateway target device failed to respond');
        this.name = 'ModbusGatewayTargetDeviceError';
    }
}
exports.ModbusGatewayTargetDeviceError = ModbusGatewayTargetDeviceError;
// ─────────────────────────────────────────────────────────────
// Additional Specific Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown for invalid starting addresses in read/write operations.
 */
class ModbusInvalidStartingAddressError extends ModbusError {
    constructor(address) {
        super(`Invalid starting address: ${address}`);
        this.name = 'ModbusInvalidStartingAddressError';
    }
}
exports.ModbusInvalidStartingAddressError = ModbusInvalidStartingAddressError;
/**
 * Represents the "Memory Parity Error" exception (Modbus exception code 0x08).
 */
class ModbusMemoryParityError extends ModbusError {
    constructor() {
        super('Memory parity error');
        this.name = 'ModbusMemoryParityError';
    }
}
exports.ModbusMemoryParityError = ModbusMemoryParityError;
/**
 * Thrown when LRC (Longitudinal Redundancy Check) validation fails (ASCII mode).
 */
class ModbusLRCError extends ModbusError {
    constructor(message = 'Modbus LRC check failed') {
        super(message);
        this.name = 'ModbusLRCError';
    }
}
exports.ModbusLRCError = ModbusLRCError;
/**
 * Generic checksum validation failure.
 */
class ModbusChecksumError extends ModbusError {
    constructor(message = 'Modbus checksum validation failed') {
        super(message);
        this.name = 'ModbusChecksumError';
    }
}
exports.ModbusChecksumError = ModbusChecksumError;
/**
 * Thrown when a parity error is detected on the serial line.
 */
class ModbusParityError extends ModbusError {
    constructor(message = 'Modbus parity check failed') {
        super(message);
        this.name = 'ModbusParityError';
    }
}
exports.ModbusParityError = ModbusParityError;
/**
 * Thrown when frame synchronization is lost (e.g., missing start/end markers).
 */
class ModbusSyncError extends ModbusError {
    constructor(message = 'Modbus frame synchronization error') {
        super(message);
        this.name = 'ModbusSyncError';
    }
}
exports.ModbusSyncError = ModbusSyncError;
/**
 * Thrown when frame boundary detection fails.
 */
class ModbusFrameBoundaryError extends ModbusError {
    constructor(message = 'Modbus frame boundary detection error') {
        super(message);
        this.name = 'ModbusFrameBoundaryError';
    }
}
exports.ModbusFrameBoundaryError = ModbusFrameBoundaryError;
// ─────────────────────────────────────────────────────────────
// Transport & Communication Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when the receive buffer has insufficient data (underrun).
 */
class ModbusBufferUnderrunError extends ModbusError {
    constructor(size, required) {
        super(`Buffer underrun: ${size} bytes available, ${required} bytes needed`);
        this.name = 'ModbusBufferUnderrunError';
    }
}
exports.ModbusBufferUnderrunError = ModbusBufferUnderrunError;
/**
 * Thrown when a communication collision is detected (e.g., in multi-master setups).
 */
class ModbusCollisionError extends ModbusError {
    constructor(message = 'Modbus communication collision detected') {
        super(message);
        this.name = 'ModbusCollisionError';
    }
}
exports.ModbusCollisionError = ModbusCollisionError;
/**
 * Thrown when communication is affected by electrical noise.
 */
class ModbusNoiseError extends ModbusError {
    constructor(message = 'Modbus communication affected by noise') {
        super(message);
        this.name = 'ModbusNoiseError';
    }
}
exports.ModbusNoiseError = ModbusNoiseError;
/**
 * Thrown when the receiver hardware overruns (data arrives faster than it can be processed).
 */
class ModbusOverrunError extends ModbusError {
    constructor(message = 'Modbus receiver overrun error') {
        super(message);
        this.name = 'ModbusOverrunError';
    }
}
exports.ModbusOverrunError = ModbusOverrunError;
/**
 * Thrown when a framing error occurs on the serial line.
 */
class ModbusFramingError extends ModbusError {
    constructor(message = 'Modbus framing error') {
        super(message);
        this.name = 'ModbusFramingError';
    }
}
exports.ModbusFramingError = ModbusFramingError;
// ─────────────────────────────────────────────────────────────
// Timing & Synchronization Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when the time between frames exceeds the allowed inter-frame timeout.
 */
class ModbusInterFrameTimeoutError extends ModbusError {
    constructor(message = 'Modbus inter-frame timeout') {
        super(message);
        this.name = 'ModbusInterFrameTimeoutError';
    }
}
exports.ModbusInterFrameTimeoutError = ModbusInterFrameTimeoutError;
/**
 * Thrown when the silent interval (3.5 character times in RTU) is violated.
 */
class ModbusSilentIntervalError extends ModbusError {
    constructor(message = 'Modbus silent interval violation') {
        super(message);
        this.name = 'ModbusSilentIntervalError';
    }
}
exports.ModbusSilentIntervalError = ModbusSilentIntervalError;
/**
 * Thrown when the configured baud rate does not match the actual rate.
 */
class ModbusBaudRateError extends ModbusError {
    constructor(expected, actual) {
        super(`Baud rate mismatch: expected ${expected}, actual ${actual}`);
        this.name = 'ModbusBaudRateError';
    }
}
exports.ModbusBaudRateError = ModbusBaudRateError;
// ─────────────────────────────────────────────────────────────
// Protocol & Gateway Errors
// ─────────────────────────────────────────────────────────────
/**
 * Thrown when a broadcast operation fails or is not supported in the current context.
 */
class ModbusBroadcastError extends ModbusError {
    constructor(message = 'Modbus broadcast operation failed') {
        super(message);
        this.name = 'ModbusBroadcastError';
    }
}
exports.ModbusBroadcastError = ModbusBroadcastError;
/**
 * Thrown when the Modbus gateway is busy.
 */
class ModbusGatewayBusyError extends ModbusError {
    constructor() {
        super('Modbus gateway is busy');
        this.name = 'ModbusGatewayBusyError';
    }
}
exports.ModbusGatewayBusyError = ModbusGatewayBusyError;
/**
 * Thrown on data overrun conditions.
 */
class ModbusDataOverrunError extends ModbusError {
    constructor() {
        super('Modbus data overrun error');
        this.name = 'ModbusDataOverrunError';
    }
}
exports.ModbusDataOverrunError = ModbusDataOverrunError;
/**
 * Thrown for configuration-related errors in the Modbus stack.
 */
class ModbusConfigError extends ModbusError {
    constructor(message = 'Modbus configuration error') {
        super(message);
        this.name = 'ModbusConfigError';
    }
}
exports.ModbusConfigError = ModbusConfigError;
/**
 * Generic memory access error.
 */
class ModbusMemoryError extends ModbusError {
    constructor(message = 'Modbus memory access error') {
        super(message);
        this.name = 'ModbusMemoryError';
    }
}
exports.ModbusMemoryError = ModbusMemoryError;
/**
 * Thrown when a stack overflow is detected in low-level operations.
 */
class ModbusStackOverflowError extends ModbusError {
    constructor(message = 'Modbus stack overflow error') {
        super(message);
        this.name = 'ModbusStackOverflowError';
    }
}
exports.ModbusStackOverflowError = ModbusStackOverflowError;
// ─────────────────────────────────────────────────────────────
// Transport Layer Errors
// ─────────────────────────────────────────────────────────────
/**
 * Base class for all transport-specific errors.
 */
class TransportError extends ModbusError {
    constructor(message) {
        super(message);
        this.name = 'TransportError';
    }
}
exports.TransportError = TransportError;
/**
 * Base class for Web Serial transport errors.
 */
class WebSerialTransportError extends TransportError {
    constructor(message) {
        super(message);
        this.name = 'WebSerialTransportError';
    }
}
exports.WebSerialTransportError = WebSerialTransportError;
/**
 * Thrown when a connection error occurs with Web Serial API.
 */
class WebSerialConnectionError extends WebSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'WebSerialConnectionError';
    }
}
exports.WebSerialConnectionError = WebSerialConnectionError;
/**
 * Thrown when a read operation fails on Web Serial transport.
 */
class WebSerialReadError extends WebSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'WebSerialReadError';
    }
}
exports.WebSerialReadError = WebSerialReadError;
/**
 * Thrown when a write operation fails on Web Serial transport.
 */
class WebSerialWriteError extends WebSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'WebSerialWriteError';
    }
}
exports.WebSerialWriteError = WebSerialWriteError;
/**
 * Base class for Node.js serial transport errors.
 */
class NodeSerialTransportError extends TransportError {
    constructor(message) {
        super(message);
        this.name = 'NodeSerialTransportError';
    }
}
exports.NodeSerialTransportError = NodeSerialTransportError;
/**
 * Thrown when a connection error occurs with Node.js serial port.
 */
class NodeSerialConnectionError extends NodeSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'NodeSerialConnectionError';
    }
}
exports.NodeSerialConnectionError = NodeSerialConnectionError;
/**
 * Thrown when a read operation fails on Node.js serial transport.
 */
class NodeSerialReadError extends NodeSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'NodeSerialReadError';
    }
}
exports.NodeSerialReadError = NodeSerialReadError;
/**
 * Thrown when a write operation fails on Node.js serial transport.
 */
class NodeSerialWriteError extends NodeSerialTransportError {
    constructor(message) {
        super(message);
        this.name = 'NodeSerialWriteError';
    }
}
exports.NodeSerialWriteError = NodeSerialWriteError;
// ─────────────────────────────────────────────────────────────
// Polling Manager Errors
// ─────────────────────────────────────────────────────────────
/**
 * Base class for all PollingManager-related errors.
 */
class PollingManagerError extends ModbusError {
    constructor(message) {
        super(message);
        this.name = 'PollingManagerError';
    }
}
exports.PollingManagerError = PollingManagerError;
/**
 * Thrown when attempting to add a task with an ID that already exists.
 */
class PollingTaskAlreadyExistsError extends PollingManagerError {
    constructor(id) {
        super(`Polling task with id "${id}" already exists.`);
        this.name = 'PollingTaskAlreadyExistsError';
    }
}
exports.PollingTaskAlreadyExistsError = PollingTaskAlreadyExistsError;
/**
 * Thrown when a requested task ID is not found in the PollingManager.
 */
class PollingTaskNotFoundError extends PollingManagerError {
    constructor(id) {
        super(`Polling task with id "${id}" does not exist.`);
        this.name = 'PollingTaskNotFoundError';
    }
}
exports.PollingTaskNotFoundError = PollingTaskNotFoundError;
/**
 * Thrown when task options fail validation (missing id, invalid interval, etc.).
 */
class PollingTaskValidationError extends PollingManagerError {
    constructor(message) {
        super(message);
        this.name = 'PollingTaskValidationError';
    }
}
exports.PollingTaskValidationError = PollingTaskValidationError;
/**
 * Thrown when an operation violates RS485/RS232 mode constraints.
 */
class RSModeConstraintError extends ModbusError {
    constructor(message) {
        super(message);
        this.name = 'RSModeConstraintError';
    }
}
exports.RSModeConstraintError = RSModeConstraintError;
//# sourceMappingURL=errors.js.map