// src/constants/constants.ts

/**
 * Modbus Function Codes
 */
export const FUNCTION_CODES = {
  READ_COILS: 0x01,
  READ_DISCRETE_INPUTS: 0x02,
  READ_HOLDING_REGISTERS: 0x03,
  READ_INPUT_REGISTERS: 0x04,
  WRITE_SINGLE_COIL: 0x05,
  WRITE_SINGLE_REGISTER: 0x06,
  WRITE_MULTIPLE_COILS: 0x0f,
  WRITE_MULTIPLE_REGISTERS: 0x10,
  REPORT_SLAVE_ID: 0x11,
  READ_DEVICE_COMMENT: 0x14,
  WRITE_DEVICE_COMMENT: 0x15,
  READ_DEVICE_IDENTIFICATION: 0x2b,
  READ_FILE_LENGTH: 0x52,
  READ_FILE_CHUNK: 0x5a,
  OPEN_FILE: 0x55,
  CLOSE_FILE: 0x57,
  RESTART_CONTROLLER: 0x5c,
  GET_CONTROLLER_TIME: 0x6e,
  SET_CONTROLLER_TIME: 0x6f,
} as const; // as const: readonly literal types for keys/values

/**
 * Modbus Exception Codes
 */
export const EXCEPTION_CODES = {
  1: 'Illegal Function',
  2: 'Illegal Data Address',
  3: 'Illegal Data Value',
  4: 'Slave Device Failure',
  5: 'Acknowledge',
  6: 'Slave Device Busy',
  8: 'Memory Parity Error',
  10: 'Gateway Path Unavailable',
  11: 'Gateway Target Device Failed to Respond',
} as const; // as const: readonly literal string types
