// src/errors.ts

import { EXCEPTION_CODES } from './constants/constants.js'; // Import for types (no .js extension in ESM/TS)

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
      EXCEPTION_CODES[exceptionCode as keyof typeof EXCEPTION_CODES] || 'Unknown Exception';
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
