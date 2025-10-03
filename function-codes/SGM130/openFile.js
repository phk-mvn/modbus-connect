// function-codes/SGM130/openFile.js

const FUNCTION_CODE = 0x55;
const MAX_FILENAME_LENGTH = 0xFA; // 250 байт
const MIN_REQUEST_LENGTH = 3; // FC (1) + ByteCount (1) + NullByte (1)
const RESPONSE_SIZE = 5; // FC (1) + FileLength (4)

/**
 * Строит PDU-запрос для открытия файла архива (FC 0x55)
 * @param {string} filename - имя файла для открытия (макс. 250 байт)
 * @returns {Uint8Array}
 * @throws {RangeError} Если имя файла слишком длинное
 */
function buildOpenFileRequest(filename) {
    if (typeof filename !== 'string') {
        throw new TypeError('Filename must be a string');
    }

    // Кодируем имя файла в ASCII
    const encoder = new TextEncoder();
    const filenameBytes = encoder.encode(filename);
    
    if (filenameBytes.length === 0 || filenameBytes.length > MAX_FILENAME_LENGTH) {
        throw new RangeError(`Filename length must be 1-${MAX_FILENAME_LENGTH} bytes, got ${filenameBytes.length}`);
    }

    const byteCount = filenameBytes.length + 1; // +1 для нулевого байта
    const bufferSize = 2 + byteCount; // FC (1) + ByteCount (1) + Data
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    const pdu = new Uint8Array(buffer);

    // Заполняем заголовок
    view.setUint8(0, FUNCTION_CODE);
    view.setUint8(1, byteCount);

    // Копируем имя файла
    pdu.set(filenameBytes, 2);
    // Добавляем нулевой байт в конец
    pdu[2 + filenameBytes.length] = 0x00;

    return pdu;
}

/**
 * Разбирает PDU-ответ на открытие файла (FC 0x55)
 * @param {Uint8Array} pdu
 * @returns {{ fileLength: number }} - длина файла в байтах
 * @throws {TypeError|Error} При неверном формате ответа
 */
function parseOpenFileResponse(pdu) {
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError('PDU must be Uint8Array');
    }

    const pduLength = pdu.length;
    if (pduLength !== RESPONSE_SIZE) {
        throw new Error(`Invalid PDU length: expected ${RESPONSE_SIZE}, got ${pduLength}`);
    }

    if (pdu[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${pdu[0].toString(16)}`);
    }

    // Читаем длину файла как 32-битное целое (Big Endian)
    const fileLength = 
        (pdu[1] << 24) | 
        (pdu[2] << 16) | 
        (pdu[3] << 8) | 
        pdu[4];

    return {
        fileLength: fileLength
    };
}

module.exports = {
    buildOpenFileRequest,
    parseOpenFileResponse
};