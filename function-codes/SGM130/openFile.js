// function-codes/SGM130/openFile.js

const FUNCTION_CODE = 0x55;
const MAX_FILENAME_LENGTH = 250;
const RESPONSE_SIZE = 5; // 1 (FC) + 4 (file length)

// Кэшируем TextEncoder для многократного использования
const textEncoder = new TextEncoder();

/**
 * Формирует запрос для открытия файла (0x55)
 * @param {string} filename - Имя файла в ASCII (без нуль-терминатора)
 * @returns {Uint8Array} - PDU запроса
 * @throws {Error} При недопустимой длине имени
 */
function buildOpenFileRequest(filename) {
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
 * Разбирает ответ на открытие файла
 * @param {Uint8Array} pdu - Ответ устройства (5 байт)
 * @returns {number} - Длина файла (uint32, big-endian)
 * @throws {TypeError|Error} При неверном формате
 */
function parseOpenFileResponse(pdu) {
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
    
    // Используем Uint32Array если выровнено, иначе DataView
    if (byteOffset % 4 === 0) {
        return new Uint32Array(buffer, byteOffset + 1, 1)[0];
    } else {
        return new DataView(buffer, byteOffset).getUint32(1, false);
    }
}

module.exports = {
    buildOpenFileRequest,
    parseOpenFileResponse,
};