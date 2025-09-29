// function-codes/read-discrete-inputs.js

const FUNCTION_CODE = 0x02;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 2000;
const REQUEST_SIZE = 5;
const RESPONSE_HEADER_SIZE = 2;

/**
 * Строит PDU-запрос для чтения дискретных входов (discrete inputs)
 * @param {number} startAddress - начальный адрес
 * @param {number} quantity - количество битов (1-2000)
 * @returns {Uint8Array}
 */
function buildReadDiscreteInputsRequest(startAddress, quantity) {
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
 * Разбирает PDU-ответ с дискретными входами (discrete inputs)
 * @param {Uint8Array} pdu
 * @returns {boolean[]} - массив значений битов
 */
function parseReadDiscreteInputsResponse(pdu) {
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

    // Получаем количество битов из PDU (первые 2 байта после function code)
    const quantity = (pdu[3] << 8) | pdu[4]; // Big-endian чтение
    if (quantity > byteCount * 8) {
        throw new Error(`Invalid quantity: ${quantity} exceeds byte capacity`);
    }

    // Оптимизированное чтение битов
    const bits = new Array(quantity);
    let bitIndex = 0;
    const dataStart = RESPONSE_HEADER_SIZE;
    
    for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
        const byte = pdu[dataStart + byteIndex];
        const maxBits = Math.min(8, quantity - bitIndex);
        
        // Развернутый цикл для обработки битов
        if (maxBits > 0) bits[bitIndex++] = (byte & (1 << 0)) !== 0;
        if (maxBits > 1) bits[bitIndex++] = (byte & (1 << 1)) !== 0;
        if (maxBits > 2) bits[bitIndex++] = (byte & (1 << 2)) !== 0;
        if (maxBits > 3) bits[bitIndex++] = (byte & (1 << 3)) !== 0;
        if (maxBits > 4) bits[bitIndex++] = (byte & (1 << 4)) !== 0;
        if (maxBits > 5) bits[bitIndex++] = (byte & (1 << 5)) !== 0;
        if (maxBits > 6) bits[bitIndex++] = (byte & (1 << 6)) !== 0;
        if (maxBits > 7) bits[bitIndex++] = (byte & (1 << 7)) !== 0;
    }

    return bits;
}

module.exports = {
    buildReadDiscreteInputsRequest,
    parseReadDiscreteInputsResponse
};