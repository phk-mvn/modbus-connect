// modbus/constants/constants.ts

export enum ModbusFunctionCode {
  READ_COILS = 0x01,
  READ_DISCRETE_INPUTS = 0x02,
  READ_HOLDING_REGISTERS = 0x03,
  READ_INPUT_REGISTERS = 0x04,
  WRITE_SINGLE_COIL = 0x05,
  WRITE_SINGLE_REGISTER = 0x06,
  WRITE_MULTIPLE_COILS = 0x0f,
  WRITE_MULTIPLE_REGISTERS = 0x10,
  REPORT_SLAVE_ID = 0x11,
  READ_DEVICE_IDENTIFICATION = 0x2b,
}

export enum ModbusExceptionCode {
  ILLEGAL_FUNCTION = 1,
  ILLEGAL_DATA_ADDRESS = 2,
  ILLEGAL_DATA_VALUE = 3,
  SLAVE_DEVICE_FAILURE = 4,
  ACKNOWLEDGE = 5,
  SLAVE_DEVICE_BUSY = 6,
  MEMORY_PARITY_ERROR = 8,
  GATEWAY_PATH_UNAVAILABLE = 10,
  GATEWAY_TARGET_DEVICE_FAILED = 11,
}

export const MODBUS_EXCEPTION_MESSAGES: Record<ModbusExceptionCode, string> = {
  [ModbusExceptionCode.ILLEGAL_FUNCTION]: 'Illegal Function',
  [ModbusExceptionCode.ILLEGAL_DATA_ADDRESS]: 'Illegal Data Address',
  [ModbusExceptionCode.ILLEGAL_DATA_VALUE]: 'Illegal Data Value',
  [ModbusExceptionCode.SLAVE_DEVICE_FAILURE]: 'Slave Device Failure',
  [ModbusExceptionCode.ACKNOWLEDGE]: 'Acknowledge',
  [ModbusExceptionCode.SLAVE_DEVICE_BUSY]: 'Slave Device Busy',
  [ModbusExceptionCode.MEMORY_PARITY_ERROR]: 'Memory Parity Error',
  [ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE]: 'Gateway Path Unavailable',
  [ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED]: 'Gateway Target Device Failed to Respond',
};
