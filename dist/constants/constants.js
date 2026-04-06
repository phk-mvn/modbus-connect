"use strict";
// modbus/constants/constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODBUS_EXCEPTION_MESSAGES = exports.ModbusExceptionCode = exports.ModbusFunctionCode = void 0;
var ModbusFunctionCode;
(function (ModbusFunctionCode) {
    ModbusFunctionCode[ModbusFunctionCode["READ_COILS"] = 1] = "READ_COILS";
    ModbusFunctionCode[ModbusFunctionCode["READ_DISCRETE_INPUTS"] = 2] = "READ_DISCRETE_INPUTS";
    ModbusFunctionCode[ModbusFunctionCode["READ_HOLDING_REGISTERS"] = 3] = "READ_HOLDING_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["READ_INPUT_REGISTERS"] = 4] = "READ_INPUT_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_COIL"] = 5] = "WRITE_SINGLE_COIL";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_SINGLE_REGISTER"] = 6] = "WRITE_SINGLE_REGISTER";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_COILS"] = 15] = "WRITE_MULTIPLE_COILS";
    ModbusFunctionCode[ModbusFunctionCode["WRITE_MULTIPLE_REGISTERS"] = 16] = "WRITE_MULTIPLE_REGISTERS";
    ModbusFunctionCode[ModbusFunctionCode["REPORT_SLAVE_ID"] = 17] = "REPORT_SLAVE_ID";
    ModbusFunctionCode[ModbusFunctionCode["READ_DEVICE_IDENTIFICATION"] = 43] = "READ_DEVICE_IDENTIFICATION";
})(ModbusFunctionCode || (exports.ModbusFunctionCode = ModbusFunctionCode = {}));
var ModbusExceptionCode;
(function (ModbusExceptionCode) {
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_FUNCTION"] = 1] = "ILLEGAL_FUNCTION";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_ADDRESS"] = 2] = "ILLEGAL_DATA_ADDRESS";
    ModbusExceptionCode[ModbusExceptionCode["ILLEGAL_DATA_VALUE"] = 3] = "ILLEGAL_DATA_VALUE";
    ModbusExceptionCode[ModbusExceptionCode["SLAVE_DEVICE_FAILURE"] = 4] = "SLAVE_DEVICE_FAILURE";
    ModbusExceptionCode[ModbusExceptionCode["ACKNOWLEDGE"] = 5] = "ACKNOWLEDGE";
    ModbusExceptionCode[ModbusExceptionCode["SLAVE_DEVICE_BUSY"] = 6] = "SLAVE_DEVICE_BUSY";
    ModbusExceptionCode[ModbusExceptionCode["MEMORY_PARITY_ERROR"] = 8] = "MEMORY_PARITY_ERROR";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_PATH_UNAVAILABLE"] = 10] = "GATEWAY_PATH_UNAVAILABLE";
    ModbusExceptionCode[ModbusExceptionCode["GATEWAY_TARGET_DEVICE_FAILED"] = 11] = "GATEWAY_TARGET_DEVICE_FAILED";
})(ModbusExceptionCode || (exports.ModbusExceptionCode = ModbusExceptionCode = {}));
exports.MODBUS_EXCEPTION_MESSAGES = {
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
//# sourceMappingURL=constants.js.map