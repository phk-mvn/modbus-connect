// function-codes/read-coils.js

const FUNCTION_CODE = 0x01;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 2000;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;

/**
 * Строит PDU-запрос для чтения дискретных выходов (coils)
 * @param {number} startAddress - начальный адрес
 * @param {number} quantity - количество битов (1-2000)
 * @returns {Uint8Array}
 */
function buildReadCoilsRequest(startAddress, quantity) {
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
 * Разбирает PDU-ответ с дискретными выходами (coils)
 * @param {Uint8Array} pdu
 * @returns {boolean[]} - массив значений битов
 */
function parseReadCoilsResponse(pdu) {
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError('PDU must be Uint8Array');
    }

    const pduLength = pdu.length;
    if (pduLength < RESPONSE_HEADER_SIZE) {
        throw new Error(`PDU too short: expected at least ${RESPONSE_HEADER_SIZE} bytes`);
    }

    if (pdu[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0].toString(16)}`);
    }

    const byteCount = pdu[1];
    const expectedLength = byteCount + RESPONSE_HEADER_SIZE;
    
    if (pduLength !== expectedLength) {
        throw new Error(`Invalid length: expected ${expectedLength}, got ${pduLength}`);
    }

    // Получаем фактическое количество битов из PDU
    const actualBitCount = (pdu[3] << 8) | pdu[4]; // Big-endian quantity
    if (actualBitCount > byteCount * 8) {
        throw new Error(`Invalid bit count: ${actualBitCount} exceeds byte capacity`);
    }

    // Оптимизированное чтение битов
    const result = new Array(actualBitCount);
    let resultIndex = 0;
    const dataStart = RESPONSE_HEADER_SIZE;
    
    for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
        const byte = pdu[dataStart + byteIndex];
        const maxBit = Math.min(8, actualBitCount - resultIndex);
        
        // Разворачиваем биты (LSB first)
        for (let bit = 0; bit < maxBit; bit++) {
            result[resultIndex++] = (byte & (1 << bit)) !== 0;
        }
    }

    return result;
}

module.exports = {
    buildReadCoilsRequest,
    parseReadCoilsResponse
};