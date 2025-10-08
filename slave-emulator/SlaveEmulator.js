// slave-emulator/SlaveEmulator.js

const logger = require('../logger.js');
const { FUNCTION_CODES } = require('../constants/constants.js');
const ModbusExceptionError = require('../errors.js');
const crc16Modbus = require('../utils/crc.js');

class SlaveEmulator {
    constructor(slaveAddress = 1, options = {}) {
        // Валидация адреса
        if (typeof slaveAddress !== 'number' || slaveAddress < 0 || slaveAddress > 247) {
            throw new Error('Slave address must be a number between 0 and 247');
        }
        this.slaveAddress = slaveAddress;

        this.coils = new Map();
        this.discreteInputs = new Map();
        this.holdingRegisters = new Map();
        this.inputRegisters = new Map();
        this.exceptions = new Map();
        this._infinityTasks = new Map();
        
        // Инициализация логгера с учетом флага
        this.loggerEnabled = !!options.loggerEnabled;
        if (this.loggerEnabled) {
            this.log = logger.createLogger('SlaveEmulator');
        } else {
            this.log = {
                info: () => {},
                debug: () => {},
                warn: () => {},
                error: () => {}
            };
        }
        
        this.connected = false;
    }

    // Методы для управления логгером
    enableLogger() {
        if (!this.loggerEnabled) {
            this.loggerEnabled = true;
            this.log = logger.createLogger('SlaveEmulator');
        }
    }

    disableLogger() {
        if (this.loggerEnabled) {
            this.loggerEnabled = false;
            this.log = {
                info: () => {},
                debug: () => {},
                warn: () => {},
                error: () => {}
            };
        }
    }

    async connect() {
        this.log.info('Connecting to emulator...');
        this.connected = true;
        this.log.info('Connected');
    }

    async disconnect() {
        this.log.info('Disconnecting from emulator...');
        this.connected = false;
        this.log.info('Disconnected');
    }

    // Валидация методов
    _validateAddress(address) {
        if (typeof address !== 'number' || address < 0 || address > 0xFFFF) {
            throw new Error(`Invalid address: ${address}. Must be between 0 and 65535`);
        }
    }

    _validateQuantity(quantity, max = 125) {
        if (typeof quantity !== 'number' || quantity <= 0 || quantity > max) {
            throw new Error(`Invalid quantity: ${quantity}. Must be between 1 and ${max}`);
        }
    }

    _validateValue(value, isRegister = false) {
        if (isRegister) {
            if (typeof value !== 'number' || value < 0 || value > 0xFFFF) {
                throw new Error(`Invalid register value: ${value}. Must be between 0 and 65535`);
            }
        } else {
            if (typeof value !== 'boolean') {
                throw new Error(`Invalid coil value: ${value}. Must be boolean`);
            }
        }
    }

    infinityChange({ typeRegister, register, range, interval }) {
        // Валидация параметров
        if (!typeRegister || typeof register !== 'number' || !Array.isArray(range) || range.length !== 2) {
            throw new Error('Invalid parameters for infinityChange');
        }
        
        if (typeof interval !== 'number' || interval <= 0) {
            throw new Error('Interval must be a positive number');
        }

        const key = `${typeRegister}:${register}`;
        
        // Остановка существующей задачи
        this.stopInfinityChange({ typeRegister, register });
        
        const [min, max] = range;
        
        const setters = {
            'Holding': (addr, val) => this.setHoldingRegister(addr, val),
            'Input': (addr, val) => this.setInputRegister(addr, val),
            'Coil': (addr, val) => this.setCoil(addr, val),
            'Discrete': (addr, val) => this.setDiscreteInput(addr, val)
        };
        
        const setter = setters[typeRegister];
        if (!setter) {
            throw new Error(`Invalid register type: ${typeRegister}`);
        }
        
        // Валидация диапазона
        if (min > max) {
            throw new Error('Min value cannot be greater than max value');
        }
        
        const intervalId = setInterval(() => {
            try {
                const value = typeRegister === 'Holding' || typeRegister === 'Input'
                    ? Math.floor(Math.random() * (max - min + 1)) + min
                    : Math.random() < 0.5;
                
                setter(register, value);
                this.log.debug('Infinity change updated', { typeRegister, register, value });
            } catch (error) {
                this.log.error('Error in infinity change task', { 
                    error: error.message, 
                    typeRegister, 
                    register 
                });
            }
        }, interval);
        
        this._infinityTasks.set(key, intervalId);
        this.log.info('Infinity change started', { typeRegister, register, interval });
    }

    stopInfinityChange({ typeRegister, register }) {
        const key = `${typeRegister}:${register}`;
        if (this._infinityTasks.has(key)) {
            clearInterval(this._infinityTasks.get(key));
            this._infinityTasks.delete(key);
            this.log.debug('Infinity change stopped', { typeRegister, register });
        }
    }

    setException(functionCode, address, exceptionCode) {
        this._validateAddress(address);
        
        this.exceptions.set(`${functionCode}_${address}`, exceptionCode);
        this.log.info(`Exception set: functionCode=0x${functionCode.toString(16)}, address=${address}, exceptionCode=0x${exceptionCode.toString(16)}`);
    }

    _checkException(functionCode, address) {
        this._validateAddress(address);
        
        const key = `${functionCode}_${address}`;
        if (this.exceptions.has(key)) {
            const exCode = this.exceptions.get(key);
            this.log.warn(`Throwing exception for function 0x${functionCode.toString(16)} at address ${address}: code 0x${exCode.toString(16)}`);
            throw new ModbusExceptionError(functionCode, exCode);
        }
    }

    addRegisters(definitions) {
        if (!definitions || typeof definitions !== 'object') {
            throw new Error('Definitions must be an object');
        }

        const stats = { coils: 0, discrete: 0, holding: 0, input: 0 };
        
        try {
            if (Array.isArray(definitions.coils)) {
                for (const { start, value } of definitions.coils) {
                    this.setCoil(start, value);
                    stats.coils++;
                }
            }
        
            if (Array.isArray(definitions.discrete)) {
                for (const { start, value } of definitions.discrete) {
                    this.setDiscreteInput(start, value);
                    stats.discrete++;
                }
            }
        
            if (Array.isArray(definitions.holding)) {
                for (const { start, value } of definitions.holding) {
                    this.setHoldingRegister(start, value);
                    stats.holding++;
                }
            }
        
            if (Array.isArray(definitions.input)) {
                for (const { start, value } of definitions.input) {
                    this.setInputRegister(start, value);
                    stats.input++;
                }
            }
        
            this.log.info('Registers added successfully', stats);
        } catch (error) {
            this.log.error('Error adding registers', { error: error.message, definitions });
            throw error;
        }
    }

    setCoil(address, value) {
        this._validateAddress(address);
        this._validateValue(value, false);
        
        this.coils.set(address, !!value);
        this.log.debug('Coil set', { address, value: !!value });
    }

    getCoil(address) {
        this._validateAddress(address);
        return this.coils.get(address) || false;
    }

    readCoils(startAddress, quantity) {
        this._validateAddress(startAddress);
        this._validateQuantity(quantity, 2000); // Максимум 2000 coils за запрос
        
        // Проверка на переполнение адресов
        if (startAddress + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        this.log.info('readCoils', { startAddress, quantity });
        
        for (let addr = startAddress; addr < startAddress + quantity; addr++) {
            this._checkException(FUNCTION_CODES.READ_COILS, addr);
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            result.push(this.getCoil(startAddress + i));
        }
        return result;
    }

    writeSingleCoil(address, value) {
        this._validateAddress(address);
        this._validateValue(value, false);
        
        this._checkException(FUNCTION_CODES.WRITE_SINGLE_COIL, address);
        this.setCoil(address, value);
        this.log.info('writeSingleCoil', { address, value: !!value });
    }

    writeMultipleCoils(startAddress, values) {
        this._validateAddress(startAddress);
        this._validateQuantity(values.length, 1968); // Максимум 1968 coils за запрос
        
        if (!Array.isArray(values)) {
            throw new Error('Values must be an array');
        }
        
        // Проверка на переполнение адресов
        if (startAddress + values.length > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        values.forEach((val, idx) => {
            this._validateValue(val, false);
            this._checkException(FUNCTION_CODES.WRITE_MULTIPLE_COILS, startAddress + idx);
        });
        
        values.forEach((val, idx) => {
            this.setCoil(startAddress + idx, val);
        });
        
        this.log.info('writeMultipleCoils', { startAddress, values });
    }

    setDiscreteInput(address, value) {
        this._validateAddress(address);
        this._validateValue(value, false);
        
        this.discreteInputs.set(address, !!value);
        this.log.debug('Discrete Input set', { address, value: !!value });
    }

    getDiscreteInput(address) {
        this._validateAddress(address);
        return this.discreteInputs.get(address) || false;
    }

    readDiscreteInputs(startAddress, quantity) {
        this._validateAddress(startAddress);
        this._validateQuantity(quantity, 2000); // Максимум 2000 inputs за запрос
        
        // Проверка на переполнение адресов
        if (startAddress + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        this.log.info('readDiscreteInputs', { startAddress, quantity });
        
        for (let addr = startAddress; addr < startAddress + quantity; addr++) {
            this._checkException(FUNCTION_CODES.READ_DISCRETE_INPUTS, addr);
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            result.push(this.getDiscreteInput(startAddress + i));
        }
        return result;
    }

    setHoldingRegister(address, value) {
        this._validateAddress(address);
        this._validateValue(value, true);
        
        const maskedValue = value & 0xFFFF;
        this.holdingRegisters.set(address, maskedValue);
        this.log.debug('Holding Register set', { address, value: maskedValue });
    }

    getHoldingRegister(address) {
        this._validateAddress(address);
        return this.holdingRegisters.get(address) || 0;
    }

    readHoldingRegisters(startAddress, quantity) {
        this._validateAddress(startAddress);
        this._validateQuantity(quantity, 125); // Максимум 125 регистров за запрос
        
        // Проверка на переполнение адресов
        if (startAddress + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        this.log.info('readHoldingRegisters', { startAddress, quantity });
        
        for (let addr = startAddress; addr < startAddress + quantity; addr++) {
            this._checkException(FUNCTION_CODES.READ_HOLDING_REGISTERS, addr);
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            result.push(this.getHoldingRegister(startAddress + i));
        }
        return result;
    }

    writeSingleRegister(address, value) {
        this._validateAddress(address);
        this._validateValue(value, true);
        
        this._checkException(FUNCTION_CODES.WRITE_SINGLE_REGISTER, address);
        this.setHoldingRegister(address, value);
        this.log.info('writeSingleRegister', { address, value });
    }

    writeMultipleRegisters(startAddress, values) {
        this._validateAddress(startAddress);
        this._validateQuantity(values.length, 123); // Максимум 123 регистра за запрос
        
        if (!Array.isArray(values)) {
            throw new Error('Values must be an array');
        }
        
        // Проверка на переполнение адресов
        if (startAddress + values.length > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        values.forEach((val, idx) => {
            this._validateValue(val, true);
            this._checkException(FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS, startAddress + idx);
        });
        
        values.forEach((val, idx) => {
            this.setHoldingRegister(startAddress + idx, val);
        });
        
        this.log.info('writeMultipleRegisters', { startAddress, values });
    }

    setInputRegister(address, value) {
        this._validateAddress(address);
        this._validateValue(value, true);
        
        const maskedValue = value & 0xFFFF;
        this.inputRegisters.set(address, maskedValue);
        this.log.debug('Input Register set', { address, value: maskedValue });
    }

    getInputRegister(address) {
        this._validateAddress(address);
        return this.inputRegisters.get(address) || 0;
    }

    readInputRegisters(startAddress, quantity) {
        this._validateAddress(startAddress);
        this._validateQuantity(quantity, 125); // Максимум 125 регистров за запрос
        
        // Проверка на переполнение адресов
        if (startAddress + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        this.log.info('readInputRegisters', { startAddress, quantity });
        
        for (let addr = startAddress; addr < startAddress + quantity; addr++) {
            this._checkException(FUNCTION_CODES.READ_INPUT_REGISTERS, addr);
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            result.push(this.getInputRegister(startAddress + i));
        }
        return result;
    }

    // --- Прямые методы (без RTU) ---

    readHolding(start, quantity) {
        this._validateAddress(start);
        this._validateQuantity(quantity, 125);
        
        // Проверка на переполнение адресов
        if (start + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            const addr = start + i;
            this._checkException(FUNCTION_CODES.READ_HOLDING_REGISTERS, addr);
            result.push(this.getHoldingRegister(addr));
        }
        return result;
    }

    readInput(start, quantity) {
        this._validateAddress(start);
        this._validateQuantity(quantity, 125);
        
        // Проверка на переполнение адресов
        if (start + quantity > 0x10000) {
            throw new Error('Address range exceeds maximum address space');
        }
        
        const result = [];
        for (let i = 0; i < quantity; i++) {
            const addr = start + i;
            this._checkException(FUNCTION_CODES.READ_INPUT_REGISTERS, addr);
            result.push(this.getInputRegister(addr));
        }
        return result;
    }

    // --- Методы диагностики и мониторинга ---

    getRegisterStats() {
        return {
            coils: this.coils.size,
            discreteInputs: this.discreteInputs.size,
            holdingRegisters: this.holdingRegisters.size,
            inputRegisters: this.inputRegisters.size,
            exceptions: this.exceptions.size,
            infinityTasks: this._infinityTasks.size
        };
    }

    getRegisterDump() {
        return {
            coils: Object.fromEntries(this.coils),
            discreteInputs: Object.fromEntries(this.discreteInputs),
            holdingRegisters: Object.fromEntries(this.holdingRegisters),
            inputRegisters: Object.fromEntries(this.inputRegisters)
        };
    }

    getInfinityTasks() {
        return Array.from(this._infinityTasks.keys());
    }

    clearAllRegisters() {
        this.coils.clear();
        this.discreteInputs.clear();
        this.holdingRegisters.clear();
        this.inputRegisters.clear();
        this.log.info('All registers cleared');
    }

    clearExceptions() {
        this.exceptions.clear();
        this.log.info('All exceptions cleared');
    }

    clearInfinityTasks() {
        for (const intervalId of this._infinityTasks.values()) {
            clearInterval(intervalId);
        }
        this._infinityTasks.clear();
        this.log.info('All infinity tasks cleared');
    }

    // --- Graceful shutdown ---

    async destroy() {
        this.log.info('Destroying SlaveEmulator');
        
        // Остановка всех бесконечных задач
        this.clearInfinityTasks();
        
        // Отключение
        if (this.connected) {
            await this.disconnect();
        }
        
        // Очистка данных
        this.clearAllRegisters();
        this.clearExceptions();
        
        this.log.info('SlaveEmulator destroyed');
    }

    // --- Modbus RTU Frame handler ---

    handleRequest(buffer) {
        try {
            if (!this.connected) {
                this.log.warn('Received request but emulator not connected');
                return null;
            }
            
            if (!(buffer instanceof Uint8Array)) {
                throw new Error('Input buffer must be Uint8Array or Buffer');
            }
            
            if (buffer.length < 5) {
                throw new Error('Invalid Modbus RTU frame: too short');
            }

            // Проверка CRC
            const crcReceived = buffer[buffer.length - 2] | (buffer[buffer.length - 1] << 8);
            const dataForCrc = buffer.subarray(0, buffer.length - 2);
            const crcCalculated = crc16Modbus(dataForCrc);
            
            if (crcReceived !== crcCalculated) {
                this.log.warn('CRC mismatch', { 
                    received: `0x${crcReceived.toString(16)}`, 
                    calculated: `0x${crcCalculated.toString(16)}`,
                    frame: Buffer.from(buffer).toString('hex')
                });
                return null;
            }

            const slaveAddr = buffer[0];
            if (slaveAddr !== this.slaveAddress && slaveAddr !== 0) {
                this.log.debug('Frame ignored - wrong slave address', { 
                    targetSlave: slaveAddr, 
                    thisSlave: this.slaveAddress 
                });
                return null;
            }

            const functionCode = buffer[1];
            const data = buffer.subarray(2, buffer.length - 2);
            
            this.log.info('Modbus request received', { 
                slaveAddress: slaveAddr, 
                functionCode: `0x${functionCode.toString(16)}`, 
                data: Buffer.from(data).toString('hex'),
                dataLength: data.length
            });

            return this._processFunctionCode(functionCode, data, slaveAddr);

        } catch (error) {
            this.log.error('Error processing Modbus request', { error: error.message, stack: error.stack });
            return this._createExceptionResponse(buffer?.[1] || 0x00, 0x04); // Slave device failure
        }
    }

    _processFunctionCode(functionCode, data, slaveAddr) {
        try {
            let responseData;
            
            switch (functionCode) {
                case FUNCTION_CODES.READ_COILS:
                    responseData = this._handleReadCoils(data);
                    break;
                case FUNCTION_CODES.READ_DISCRETE_INPUTS:
                    responseData = this._handleReadDiscreteInputs(data);
                    break;
                case FUNCTION_CODES.READ_HOLDING_REGISTERS:
                    responseData = this._handleReadHoldingRegisters(data);
                    break;
                case FUNCTION_CODES.READ_INPUT_REGISTERS:
                    responseData = this._handleReadInputRegisters(data);
                    break;
                case FUNCTION_CODES.WRITE_SINGLE_COIL:
                    responseData = this._handleWriteSingleCoil(data);
                    break;
                case FUNCTION_CODES.WRITE_SINGLE_REGISTER:
                    responseData = this._handleWriteSingleRegister(data);
                    break;
                case FUNCTION_CODES.WRITE_MULTIPLE_COILS:
                    responseData = this._handleWriteMultipleCoils(data);
                    break;
                case FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS:
                    responseData = this._handleWriteMultipleRegisters(data);
                    break;
                default:
                    this.log.warn('Unsupported function code', { functionCode: `0x${functionCode.toString(16)}` });
                    throw new ModbusExceptionError(functionCode, 0x01); // Illegal function
            }

            return this._createSuccessResponse(slaveAddr, functionCode, responseData);

        } catch (error) {
            if (error instanceof ModbusExceptionError) {
                return this._createExceptionResponse(functionCode, error.exceptionCode);
            }
            throw error;
        }
    }

    // Специализированные методы обработки
    _handleReadCoils(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Read Coils');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 2000);
        
        const coils = this.readCoils(startAddr, qty);
        const byteCount = Math.ceil(qty / 8);
        const resp = new Uint8Array(1 + byteCount);
        resp[0] = byteCount;
        
        for (let i = 0; i < qty; i++) {
            if (coils[i]) {
                resp[1 + Math.floor(i / 8)] |= 1 << (i % 8);
            }
        }
        
        return resp;
    }

    _handleReadDiscreteInputs(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Read Discrete Inputs');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 2000);
        
        const inputs = this.readDiscreteInputs(startAddr, qty);
        const byteCount = Math.ceil(qty / 8);
        const resp = new Uint8Array(1 + byteCount);
        resp[0] = byteCount;
        
        for (let i = 0; i < qty; i++) {
            if (inputs[i]) {
                resp[1 + Math.floor(i / 8)] |= 1 << (i % 8);
            }
        }
        
        return resp;
    }

    _handleReadHoldingRegisters(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Read Holding Registers');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 125);
        
        const registers = this.readHoldingRegisters(startAddr, qty);
        const byteCount = qty * 2;
        const resp = new Uint8Array(1 + byteCount);
        resp[0] = byteCount;
        
        for (let i = 0; i < qty; i++) {
            resp[1 + i * 2] = registers[i] >> 8;
            resp[2 + i * 2] = registers[i] & 0xFF;
        }
        
        return resp;
    }

    _handleReadInputRegisters(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Read Input Registers');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 125);
        
        const registers = this.readInputRegisters(startAddr, qty);
        const byteCount = qty * 2;
        const resp = new Uint8Array(1 + byteCount);
        resp[0] = byteCount;
        
        for (let i = 0; i < qty; i++) {
            resp[1 + i * 2] = registers[i] >> 8;
            resp[2 + i * 2] = registers[i] & 0xFF;
        }
        
        return resp;
    }

    _handleWriteSingleCoil(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Write Single Coil');
        }
        
        const addr = (data[0] << 8) | data[1];
        const val = (data[2] << 8) | data[3];
        
        if (val !== 0x0000 && val !== 0xFF00) {
            throw new Error('Invalid coil value');
        }
        
        this._validateAddress(addr);
        this.writeSingleCoil(addr, val === 0xFF00);
        
        return data;
    }

    _handleWriteSingleRegister(data) {
        if (data.length !== 4) {
            throw new Error('Invalid data length for Write Single Register');
        }
        
        const addr = (data[0] << 8) | data[1];
        const val = (data[2] << 8) | data[3];
        
        this._validateAddress(addr);
        this._validateValue(val, true);
        this.writeSingleRegister(addr, val);
        
        return data;
    }

    _handleWriteMultipleCoils(data) {
        if (data.length < 5) {
            throw new Error('Invalid data length for Write Multiple Coils');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        const byteCount = data[4];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 1968);
        
        if (byteCount !== data.length - 5) {
            throw new Error('Byte count mismatch');
        }
        
        const coilValues = [];
        for (let i = 0; i < qty; i++) {
            const byteIndex = 5 + Math.floor(i / 8);
            const bitIndex = i % 8;
            coilValues.push((data[byteIndex] & (1 << bitIndex)) !== 0);
        }
        
        this.writeMultipleCoils(startAddr, coilValues);
        
        return data.subarray(0, 4);
    }

    _handleWriteMultipleRegisters(data) {
        if (data.length < 5) {
            throw new Error('Invalid data length for Write Multiple Registers');
        }
        
        const startAddr = (data[0] << 8) | data[1];
        const qty = (data[2] << 8) | data[3];
        const byteCount = data[4];
        
        this._validateAddress(startAddr);
        this._validateQuantity(qty, 123);
        
        if (byteCount !== qty * 2) {
            throw new Error('Byte count mismatch');
        }
        
        const regValues = [];
        for (let i = 0; i < qty; i++) {
            regValues.push((data[5 + i * 2] << 8) | data[6 + i * 2]);
        }
        
        this.writeMultipleRegisters(startAddr, regValues);
        
        return data.subarray(0, 4);
    }

    _createSuccessResponse(slaveAddr, functionCode, responseData) {
        const respBuf = new Uint8Array(2 + responseData.length + 2);
        respBuf[0] = slaveAddr;
        respBuf[1] = functionCode;
        respBuf.set(responseData, 2);
        
        const crc = crc16Modbus(respBuf.subarray(0, respBuf.length - 2));
        respBuf[respBuf.length - 2] = crc & 0xFF;
        respBuf[respBuf.length - 1] = crc >> 8;
        
        this.log.info('Modbus response created', { 
            response: Buffer.from(respBuf).toString('hex'),
            length: respBuf.length
        });
        
        return respBuf;
    }

    _createExceptionResponse(functionCode, exceptionCode) {
        const excBuf = new Uint8Array(5);
        excBuf[0] = this.slaveAddress;
        excBuf[1] = functionCode | 0x80;
        excBuf[2] = exceptionCode;
        
        const crc = crc16Modbus(excBuf.subarray(0, 3));
        excBuf[3] = crc & 0xFF;
        excBuf[4] = crc >> 8;
        
        this.log.warn('Exception response created', { 
            response: Buffer.from(excBuf).toString('hex'),
            functionCode: `0x${functionCode.toString(16)}`,
            exceptionCode
        });
        
        return excBuf;
    }
}

module.exports = SlaveEmulator;