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

/**
 * Error class for Polling Manager errors
 */
export class PollingManagerError extends ModbusError {
  constructor(message: string);
}

/**
 * Error class for Polling task already exists
 */
export class PollingTaskAlreadyExistsError extends PollingManagerError {
  constructor(id: string);
}

/**
 * Error class for Polling task not found
 */
export class PollingTaskNotFoundError extends PollingManagerError {
  constructor(id: string);
}

/**
 * Error class for Polling task validation errors
 */
export class PollingTaskValidationError extends PollingManagerError {
  constructor(message: string);
}
