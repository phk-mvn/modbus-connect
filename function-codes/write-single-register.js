// function-codes/write-single-register.js

const FUNCTION_CODE = 0x06;
const PDU_SIZE = 5;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 0xFFFF;
const MIN_VALUE = 0;
const MAX_VALUE = 0xFFFF;

/**
 * Валидация адреса регистра
 * @param {number} address - адрес регистра
 */
function validateRegisterAddress(address) {
    if ((address | 0) !== address || address < MIN_ADDRESS || address > MAX_ADDRESS) {
        throw new RangeError(`Address must be ${MIN_ADDRESS}-${MAX_ADDRESS}, got ${address}`);
    }
}

/**
 * Валидация значения регистра
 * @param {number} value - значение регистра
 */
function validateRegisterValue(value) {
    if ((value | 0) !== value || value < MIN_VALUE || value > MAX_VALUE) {
        throw new RangeError(`Value must be ${MIN_VALUE}-${MAX_VALUE}, got ${value}`);
    }
}

/**
 * Строит PDU-запрос для записи одного регистра (Write Single Register)
 * @param {number} address - адрес регистра
 * @param {number} value - значение регистра
 * @returns {Uint8Array}
 * @throws {RangeError} Если адрес или значение регистра вне допустимого диапазона
 */
function buildWriteSingleRegisterRequest(address, value) {
    // Валидация параметров
    validateRegisterAddress(address);
    validateRegisterValue(value);

    // Создаем буфер и представление
    const buffer = new ArrayBuffer(PDU_SIZE);
    const view = new DataView(buffer);
    
    // Заполняем PDU
    view.setUint8(0, FUNCTION_CODE);
    view.setUint16(1, address, false);
    view.setUint16(3, value, false);

    return new Uint8Array(buffer);
}

/**
 * Разбирает PDU-ответ на запись одного регистра
 * @param {Uint8Array} pdu
 * @returns {{ address: number, value: number }}
 * @throws {TypeError} Если PDU не является Uint8Array
 * @throws {Error} Если PDU имеет неправильную длину или код функции
 */
function parseWriteSingleRegisterResponse(pdu) {
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError(`PDU must be Uint8Array, got ${pdu?.constructor?.name || typeof pdu}`);
    }

    const pduLength = pdu.length;
    if (pduLength !== PDU_SIZE) {
        throw new Error(`Invalid PDU length: expected ${PDU_SIZE}, got ${pduLength}`);
    }

    if (pdu[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0].toString(16)}`);
    }

    // Используем оригинальный буфер без копирования
    const buffer = pdu.buffer || pdu;
    const byteOffset = pdu.byteOffset || 0;
    const view = new DataView(buffer, byteOffset, PDU_SIZE);

    return {
        address: view.getUint16(1, false),
        value: view.getUint16(3, false)
    };
}

module.exports = {
    buildWriteSingleRegisterRequest,
    parseWriteSingleRegisterResponse
};