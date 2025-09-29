// function-codes/write-single-coil.js

const FUNCTION_CODE = 0x05;
const COIL_ON = 0xFF00;
const COIL_OFF = 0x0000;
const PDU_SIZE = 5;
const MIN_ADDRESS = 0;
const MAX_ADDRESS = 0xFFFF;

/**
 * Валидация адреса катушки
 * @param {number} address - адрес катушки
 */
function validateCoilAddress(address) {
    if ((address | 0) !== address || address < MIN_ADDRESS || address > MAX_ADDRESS) {
        throw new RangeError(`Address must be ${MIN_ADDRESS}-${MAX_ADDRESS}, got ${address}`);
    }
}

/**
 * Валидация значения катушки
 * @param {any} value - значение катушки
 */
function validateCoilValue(value) {
    // Быстрая проверка булевых значений и 1/0
    if (value !== !!value && value !== (value | 0)) {
        throw new TypeError(`Value must be boolean or 0/1, got ${typeof value} ${value}`);
    }
}

/**
 * Строит PDU-запрос для записи одной катушки (Write Single Coil)
 * @param {number} address - адрес катушки
 * @param {boolean|number} value - значение катушки (true/false или 1/0)
 * @returns {Uint8Array}
 * @throws {RangeError} Если адрес катушки или её значение вне допустимого диапазона
 */
function buildWriteSingleCoilRequest(address, value) {
    // Валидация параметров
    validateCoilAddress(address);
    validateCoilValue(value);

    // Создаем буфер и представление
    const buffer = new ArrayBuffer(PDU_SIZE);
    const view = new DataView(buffer);
    
    // Заполняем PDU
    view.setUint8(0, FUNCTION_CODE);
    view.setUint16(1, address, false);
    view.setUint16(3, value ? COIL_ON : COIL_OFF, false);

    return new Uint8Array(buffer);
}

/**
 * Разбирает PDU-ответ на запись одной катушки
 * @param {Uint8Array} pdu
 * @returns {{ address: number, value: boolean }}
 * @throws {TypeError} Если PDU не является Uint8Array
 * @throws {Error} Если PDU имеет неправильную длину или код функции
 */
function parseWriteSingleCoilResponse(pdu) {
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

    const address = view.getUint16(1, false);
    const valueRaw = view.getUint16(3, false);

    // Проверка значения через switch (быстрее для 2 вариантов)
    switch (valueRaw) {
        case COIL_ON: return { address, value: true };
        case COIL_OFF: return { address, value: false };
        default:
            throw new Error(`Invalid coil value: expected 0x${COIL_ON.toString(16)} or 0x${COIL_OFF.toString(16)}, got 0x${valueRaw.toString(16)}`);
    }
}

module.exports = {
    buildWriteSingleCoilRequest,
    parseWriteSingleCoilResponse
};