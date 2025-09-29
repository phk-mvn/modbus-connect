// function-codes/SGM130/read-file-length.js

const FUNCTION_CODE = 0x52;
const MAX_FILENAME_LENGTH = 250;
const RESPONSE_SIZE = 5; // 1 (FC) + 4 (file length)
const FILE_NOT_FOUND = 0xFFFFFFFF;

// Кэшируем TextEncoder для многократного использования
const textEncoder = new TextEncoder();

/**
 * Формирует запрос на чтение длины файла (0x52)
 * @param {string} filename - Имя файла в ASCII (без нуль-терминатора)
 * @returns {Uint8Array} - PDU запроса
 * @throws {Error} При недопустимой длине имени
 */
function buildReadFileLengthRequest(filename) {
    const nameBytes = textEncoder.encode(filename);
    const nameLength = nameBytes.length;
    
    // Быстрая проверка длины
    if (nameLength > MAX_FILENAME_LENGTH) {
        throw new Error(`Filename exceeds ${MAX_FILENAME_LENGTH} bytes`);
    }

    // Создаем буфер сразу нужного размера (без DataView)
    const pdu = new Uint8Array(2 + nameLength + 1);
    
    // Заполняем данные напрямую (быстрее, чем через DataView)
    pdu[0] = FUNCTION_CODE;
    pdu[1] = nameLength;
    pdu.set(nameBytes, 2);
    pdu[pdu.length - 1] = 0x00; // нуль-терминатор

    return pdu;
}

/**
 * Разбирает ответ на запрос длины файла
 * @param {Uint8Array} pdu - Ответ устройства (5 байт)
 * @returns {number} - Длина файла (uint32) или -1 если файл не найден
 * @throws {TypeError|Error} При неверном формате
 */
function parseReadFileLengthResponse(pdu) {
    // Строгая проверка типа без try/catch
    if (!(pdu?.constructor === Uint8Array)) {
        throw new TypeError(`Expected Uint8Array, got ${pdu?.constructor?.name || typeof pdu}`);
    }

    // Проверка размера и кода функции одним сравнением
    if (pdu.length !== RESPONSE_SIZE || pdu[0] !== FUNCTION_CODE) {
        const receivedCode = pdu[0]?.toString(16).padStart(2, '0') || 'null';
        throw new Error(`Invalid response: expected ${RESPONSE_SIZE} bytes (FC=0x${FUNCTION_CODE.toString(16)}), got ${pdu.length} bytes (FC=0x${receivedCode})`);
    }

    // Оптимальное чтение uint32 (выровненный доступ)
    const buffer = pdu.buffer || pdu;
    const byteOffset = pdu.byteOffset || 0;
    let length;
    
    if (byteOffset % 4 === 0) {
        length = new Uint32Array(buffer, byteOffset + 1, 1)[0];
    } else {
        length = new DataView(buffer, byteOffset).getUint32(1, false);
    }

    return length === FILE_NOT_FOUND ? -1 : length;
}

module.exports = {
    buildReadFileLengthRequest,
    parseReadFileLengthResponse,
    // Для тестов
    _TEST_CONSTANTS: { FUNCTION_CODE, MAX_FILENAME_LENGTH, FILE_NOT_FOUND }
};