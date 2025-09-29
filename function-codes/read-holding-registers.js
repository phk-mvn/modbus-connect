// function-codes/read-holding-registers.js

const FUNCTION_CODE = 0x03;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 125;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;
const UINT16_SIZE = 2;

/**
 * Строит PDU-запрос для чтения holding регистров
 * @param {number} startAddress - начальный адрес
 * @param {number} quantity - количество регистров (1-125)
 * @returns {Uint8Array}
 */
function buildReadHoldingRegistersRequest(startAddress, quantity) {
    // Быстрая проверка через побитовые операции
    if ((quantity | 0) !== quantity || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
        throw new RangeError(`Quantity must be integer ${MIN_QUANTITY}-${MAX_QUANTITY}`);
    }

    // Используем ArrayBuffer + DataView для единообразия стиля
    const buffer = new ArrayBuffer(REQUEST_SIZE);
    const view = new DataView(buffer);
    
    view.setUint8(0, FUNCTION_CODE);
    view.setUint16(1, startAddress, false); // Big-endian
    view.setUint16(3, quantity, false); // Big-endian
    
    return new Uint8Array(buffer);
}

/**
 * Разбирает PDU-ответ с holding регистрами
 * @param {Uint8Array} pdu
 * @returns {number[]} - массив значений регистров
 */
function parseReadHoldingRegistersResponse(pdu) {
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError('PDU must be Uint8Array');
    }

    const pduLength = pdu.length;
    if (pduLength < RESPONSE_HEADER_SIZE) {
        throw new Error('PDU too short');
    }

    if (pdu[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid function code: expected 0x03, got 0x${pdu[0].toString(16)}`);
    }

    const byteCount = pdu[1];
    const expectedLength = byteCount + RESPONSE_HEADER_SIZE;
    
    if (pduLength !== expectedLength) {
        throw new Error(`Invalid length: expected ${expectedLength}, got ${pduLength}`);
    }

    if (byteCount === 0) {
        return [];
    }

    // Безопасное чтение с учетом выравнивания
    const buffer = pdu.buffer || pdu;
    const byteOffset = (pdu.byteOffset || 0) + RESPONSE_HEADER_SIZE;
    const registerCount = byteCount / UINT16_SIZE;
    const registers = new Array(registerCount);

    // Проверяем выравнивание и используем оптимальный метод
    if (byteOffset % UINT16_SIZE === 0) {
        // Оптимальный путь - прямое чтение через Uint16Array
        const uint16View = new Uint16Array(buffer, byteOffset, registerCount);
        for (let i = 0; i < registerCount; i++) {
            registers[i] = uint16View[i];
        }
    } else {
        // Медленный путь - чтение через DataView
        const view = new DataView(buffer, byteOffset - RESPONSE_HEADER_SIZE, byteCount + RESPONSE_HEADER_SIZE);
        for (let i = 0; i < registerCount; i++) {
            registers[i] = view.getUint16(RESPONSE_HEADER_SIZE + i * UINT16_SIZE, false);
        }
    }

    return registers;
}

module.exports = {
    buildReadHoldingRegistersRequest,
    parseReadHoldingRegistersResponse
};