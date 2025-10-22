// src/types/errors.d.ts

/**
 * Base class for all Modbus errors
 */
export class ModbusError extends Error {
  constructor(message: string);
}

/**
 * Error class for Modbus timeout
 */
export class ModbusTimeoutError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus CRC check failure
 */
export class ModbusCRCError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus response errors
 */
export class ModbusResponseError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus too many empty reads
 */
export class ModbusTooManyEmptyReadsError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus exception
 */
export class ModbusExceptionError extends ModbusError {
  functionCode: number;
  exceptionCode: number;

  constructor(functionCode: number, exceptionCode: number);
}

/**
 * Error class for Modbus flush error
 */
export class ModbusFlushError extends ModbusError {
  constructor(message?: string);
}

// --- Errors for Data Validation ---

/**
 * Error class for invalid Modbus address
 */
export class ModbusInvalidAddressError extends ModbusError {
  constructor(address: number);
}

/**
 * Error class for invalid function code
 */
export class ModbusInvalidFunctionCodeError extends ModbusError {
  constructor(functionCode: number);
}

/**
 * Error class for invalid quantity (register/coil count)
 */
export class ModbusInvalidQuantityError extends ModbusError {
  constructor(quantity: number, min: number, max: number);
}

/**
 * Error class for illegal data address exception
 */
export class ModbusIllegalDataAddressError extends ModbusError {
  constructor(address: number, quantity: number);
}

/**
 * Error class for illegal data value exception
 */
export class ModbusIllegalDataValueError extends ModbusError {
  constructor(value: number | string, expected: string);
}

/**
 * Error class for slave device busy exception
 */
export class ModbusSlaveBusyError extends ModbusError {
  constructor();
}

/**
 * Error class for acknowledge exception
 */
export class ModbusAcknowledgeError extends ModbusError {
  constructor();
}

/**
 * Error class for slave device failure exception
 */
export class ModbusSlaveDeviceFailureError extends ModbusError {
  constructor();
}

// --- Errors for Message Format ---

/**
 * Error class for malformed Modbus frame
 */
export class ModbusMalformedFrameError extends ModbusResponseError {
  constructor(rawData: Buffer | Uint8Array);
}

/**
 * Error class for invalid frame length
 */
export class ModbusInvalidFrameLengthError extends ModbusResponseError {
  constructor(received: number, expected: number);
}

/**
 * Error class for invalid Modbus transaction ID
 */
export class ModbusInvalidTransactionIdError extends ModbusResponseError {
  constructor(received: number, expected: number);
}

/**
 * Error class for unexpected function code in response
 */
export class ModbusUnexpectedFunctionCodeError extends ModbusResponseError {
  constructor(sent: number, received: number);
}

// --- Errors for Connection and Transport ---

/**
 * Error class for connection refused
 */
export class ModbusConnectionRefusedError extends ModbusError {
  constructor(host: string, port: number);
}

/**
 * Error class for connection timeout
 */
export class ModbusConnectionTimeoutError extends ModbusError {
  constructor(host: string, port: number, timeout: number);
}

/**
 * Error class for not connected
 */
export class ModbusNotConnectedError extends ModbusError {
  constructor();
}

/**
 * Error class for already connected
 */
export class ModbusAlreadyConnectedError extends ModbusError {
  constructor();
}

// --- Errors for Buffer and Data ---

/**
 * Error class for buffer overflow
 */
export class ModbusBufferOverflowError extends ModbusError {
  constructor(size: number, max: number);
}

/**
 * Error class for insufficient data
 */
export class ModbusInsufficientDataError extends ModbusResponseError {
  constructor(received: number, required: number);
}

/**
 * Error class for data type conversion errors
 */
export class ModbusDataConversionError extends ModbusError {
  constructor(data: any, expectedType: string);
}

// --- Errors for Security and Access ---

/**
 * Error class for gateway path unavailable
 */
export class ModbusGatewayPathUnavailableError extends ModbusError {
  constructor();
}

/**
 * Error class for gateway target device failed to respond
 */
export class ModbusGatewayTargetDeviceError extends ModbusError {
  constructor();
}

// --- Errors for Specific Functions ---

/**
 * Error class for invalid starting address in read operations
 */
export class ModbusInvalidStartingAddressError extends ModbusError {
  constructor(address: number);
}

/**
 * Error class for memory parity error (function code 8)
 */
export class ModbusMemoryParityError extends ModbusError {
  constructor();
}

// --- Additional Integrity and Checksum Errors ---

/**
 * Error class for Modbus LRC (Longitudinal Redundancy Check) failure
 */
export class ModbusLRCError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus checksum validation failure
 */
export class ModbusChecksumError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus parity bit error
 */
export class ModbusParityError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus frame synchronization error
 */
export class ModbusSyncError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus frame boundary detection error
 */
export class ModbusFrameBoundaryError extends ModbusError {
  constructor(message?: string);
}

// --- Additional Transport and Communication Errors ---

/**
 * Error class for Modbus buffer underrun
 */
export class ModbusBufferUnderrunError extends ModbusError {
  constructor(size: number, required: number);
}

/**
 * Error class for Modbus communication collision
 */
export class ModbusCollisionError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus noise error
 */
export class ModbusNoiseError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus overrun error
 */
export class ModbusOverrunError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus framing error
 */
export class ModbusFramingError extends ModbusError {
  constructor(message?: string);
}

// --- Additional Timing and Synchronization Errors ---

/**
 * Error class for Modbus inter-frame timeout
 */
export class ModbusInterFrameTimeoutError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus silent interval violation
 */
export class ModbusSilentIntervalError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus baud rate configuration error
 */
export class ModbusBaudRateError extends ModbusError {
  constructor(expected: number, actual: number);
}

// --- Additional Protocol-Specific Errors ---

/**
 * Error class for Modbus broadcast operation error
 */
export class ModbusBroadcastError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus gateway busy error
 */
export class ModbusGatewayBusyError extends ModbusError {
  constructor();
}

/**
 * Error class for Modbus data overrun error
 */
export class ModbusDataOverrunError extends ModbusError {
  constructor();
}

/**
 * Error class for Modbus configuration error
 */
export class ModbusConfigError extends ModbusError {
  constructor(message?: string);
}

// --- Additional Memory and Buffer Errors ---

/**
 * Error class for Modbus memory error
 */
export class ModbusMemoryError extends ModbusError {
  constructor(message?: string);
}

/**
 * Error class for Modbus stack overflow error
 */
export class ModbusStackOverflowError extends ModbusError {
  constructor(message?: string);
}

// --- Errors for Transports ---

/**
 * Base class for all Transport errors
 */
export class TransportError extends ModbusError {
  constructor(message: string);
}

/**
 * Error class for Web Serial transport errors
 */
export class WebSerialTransportError extends TransportError {
  constructor(message: string);
}

/**
 * Error class for Web Serial connection errors
 */
export class WebSerialConnectionError extends WebSerialTransportError {
  constructor(message: string);
}

/**
 * Error class for Web Serial read errors
 */
export class WebSerialReadError extends WebSerialTransportError {
  constructor(message: string);
}

/**
 * Error class for Web Serial write errors
 */
export class WebSerialWriteError extends WebSerialTransportError {
  constructor(message: string);
}

/**
 * Error class for Node Serial transport errors
 */
export class NodeSerialTransportError extends TransportError {
  constructor(message: string);
}

/**
 * Error class for Node Serial connection errors
 */
export class NodeSerialConnectionError extends NodeSerialTransportError {
  constructor(message: string);
}

/**
 * Error class for Node Serial read errors
 */
export class NodeSerialReadError extends NodeSerialTransportError {
  constructor(message: string);
}

/**
 * Error class for Node Serial write errors
 */
export class NodeSerialWriteError extends NodeSerialTransportError {
  constructor(message: string);
}

export class PollingManagerError extends ModbusError {
  constructor(message: string);
}

export class PollingTaskAlreadyExistsError extends PollingManagerError {
  constructor(id: string);
}

export class PollingTaskNotFoundError extends PollingManagerError {
  constructor(id: string);
}

export class PollingTaskValidationError extends PollingManagerError {
  constructor(message: string);
}
