// errors.js

const EXCEPTION_CODES = require('./constants/constants.js');

/**
 * Base class for all Modbus errors
 *
 * @class ModbusError
 * @extends Error
 */
class ModbusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModbusError';
  }
}

/**
 * Error class for Modbus timeout
 *
 * @class ModbusTimeoutError
 * @extends ModbusError
 */
class ModbusTimeoutError extends ModbusError {
  constructor(message = 'Modbus request timed out') {
    super(message);
    this.name = 'ModbusTimeoutError';
  }
}

/**
 * Error class for Modbus CRC check failure
 *
 * @class ModbusCRCError
 * @extends ModbusError
 */
class ModbusCRCError extends ModbusError {
  constructor(message = 'Modbus CRC check failed') {
    super(message);
    this.name = 'ModbusCRCError';
  }
}

/**
 * Error class for Modbus response errors
 *
 * @class ModbusResponseError
 * @extends ModbusError
 */
class ModbusResponseError extends ModbusError {
  constructor(message = 'Invalid Modbus response') {
    super(message);
    this.name = 'ModbusResponseError';
  }
}

/**
 * Error class for Modbus too many empty reads
 *
 * @class ModbusTooManyEmptyReadsError
 * @extends ModbusError
 */
class ModbusTooManyEmptyReadsError extends ModbusError {
  constructor(message = 'Too many empty reads from transport') {
    super(message);
    this.name = 'ModbusTooManyEmptyReadsError';
  }
}

/**
 * Error class for Modbus exception
 *
 * @class ModbusExceptionError
 * @extends ModbusError
 */
class ModbusExceptionError extends ModbusError {
  constructor(functionCode, exceptionCode) {
    const exceptionMessage = EXCEPTION_CODES[exceptionCode] || 'Unknown Exception';
    super(`Modbus exception: function 0x${functionCode.toString(16)}, code 0x${exceptionCode.toString(16)} (${exceptionMessage})`);
    this.name = 'ModbusExceptionError';
    this.functionCode = functionCode;
    this.exceptionCode = exceptionCode;
  }
}

class ModbusFlushError extends ModbusError {
  constructor(message = 'Modbus operation interrupted by transport flush'){
    super(message)
    this.name = 'ModbusFlushError'
  }
}

module.exports = {
  ModbusError,
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTooManyEmptyReadsError,
  ModbusExceptionError,
  ModbusFlushError
  };