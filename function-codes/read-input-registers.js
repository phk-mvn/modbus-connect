// function-codes/read-input-registers.js

const FUNCTION_CODE = 0x04; // READ_INPUT_REGISTERS
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 125;
const REQUEST_SIZE = 5; // 1 (FC) + 2 (Addr) + 2 (Qty)
const RESPONSE_HEADER_SIZE = 2; // FC (1) + ByteCount (1)
const UINT16_SIZE = 2;

/**
 * Строит PDU-запрос для чтения input-регистров (FC 0x04)
 * @param {number} startAddress - начальный адрес (0x0000–0xFFFF)
 * @param {number} quantity - количество регистров (1–125)
 * @returns {Uint8Array}
 */
function buildReadInputRegistersRequest(startAddress, quantity) {
    // Быстрая проверка через побитовые операции
    if ((quantity | 0) !== quantity || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
        throw new RangeError(`Quantity must be integer ${MIN_QUANTITY}-${MAX_QUANTITY}`);
    }

    const buffer = new Uint8Array(REQUEST_SIZE);
    buffer[0] = FUNCTION_CODE;
    buffer[1] = startAddress >>> 8;  // Старший байт адреса
    buffer[2] = startAddress & 0xFF; // Младший байт адреса
    buffer[3] = quantity >>> 8;      // Старший байт количества
    buffer[4] = quantity & 0xFF;     // Младший байт количества
    
    return buffer;
}

/**
 * Разбирает PDU-ответ с input-регистрами (FC 0x04)
 * @param {Uint8Array} pdu - принятый PDU-пакет
 * @returns {number[]} - массив значений регистров
 * @throws {TypeError|Error} - при неверных данных
 */
function parseReadInputRegistersResponse(pdu) {
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError('PDU must be Uint8Array');
    }

    const pduLength = pdu.length;
    if (pduLength < RESPONSE_HEADER_SIZE) {
        throw new Error('PDU too short');
    }

    if (pdu[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid function code: expected 0x04, got 0x${pdu[0].toString(16).padStart(2, '0')}`);
    }

    const byteCount = pdu[1];
    if (byteCount % UINT16_SIZE !== 0) {
        throw new Error(`Invalid byte count: must be multiple of ${UINT16_SIZE}`);
    }

    const expectedLength = RESPONSE_HEADER_SIZE + byteCount;
    if (pduLength !== expectedLength) {
        throw new Error(`Invalid PDU length: expected ${expectedLength}, got ${pduLength}`);
    }

    if (byteCount === 0) {
        return [];
    }

    const buffer = pdu.buffer || pdu;
    const byteOffset = (pdu.byteOffset || 0) + RESPONSE_HEADER_SIZE;
    const registerCount = byteCount / UINT16_SIZE;
    const registers = new Array(registerCount);

    // Используем Uint16Array, если данные выровнены, иначе DataView
    if (byteOffset % UINT16_SIZE === 0) {
        const uint16View = new Uint16Array(buffer, byteOffset, registerCount);
        registers.set(uint16View); // Быстрее, чем цикл for
    } else {
        const view = new DataView(buffer, byteOffset, byteCount);
        for (let i = 0; i < registerCount; i++) {
            registers[i] = view.getUint16(i * UINT16_SIZE, false);
        }
    }

    return registers;
}

module.exports = {
    buildReadInputRegistersRequest,
    parseReadInputRegistersResponse
};