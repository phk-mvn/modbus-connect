// function-codes/SGM130/write-device-comment.js

const FUNCTION_CODE = 0x15;
const MAX_CHANNEL = 255;
const MAX_COMMENT_LENGTH = 16;
const REQUEST_SIZE = 19; // 1 (FC) + 1 (channel) + 1 (len) + 16 (data)
const RESPONSE_SIZE = 3;
const SPACE_CODE = 0;

// Оптимизированная таблица символов как Uint8Array (индекс = код символа)
const CHAR_CODE_TABLE = new Uint8Array(128).fill(0); // ASCII таблица

// Инициализация таблицы (выполняется один раз)
(function initCharTable() {
    // Заполняем поддерживаемые символы
    const symbols = [
        [' ', 0], ['0', 1], ['1', 2], ['2', 3], ['3', 4], ['4', 5], ['5', 6], 
        ['6', 7], ['7', 8], ['8', 9], ['9', 10],
        ['A', 11], ['B', 12], ['C', 13], ['D', 14], ['E', 15], ['F', 16], 
        ['G', 17], ['H', 18], ['I', 19], ['J', 20], ['K', 21], ['L', 22], 
        ['M', 23], ['N', 24], ['O', 25], ['P', 26], ['Q', 27], ['R', 28], 
        ['S', 29], ['T', 30], ['U', 31], ['V', 32], ['X', 33], ['Y', 34], 
        ['Z', 35],
        ['А', 37], ['Б', 38], ['В', 39], ['Г', 40], ['Д', 41], ['Е', 42], 
        ['Ж', 43], ['З', 44], ['И', 45], ['Й', 46], ['К', 47], ['Л', 48], 
        ['М', 49], ['Н', 50], ['О', 51], ['П', 52], ['Р', 53], ['С', 54], 
        ['Т', 55], ['У', 56], ['Ф', 57], ['Х', 58], ['Ц', 59], ['Ч', 60], 
        ['Ш', 61], ['Щ', 62], ['Ъ', 63], ['Ы', 64], ['Ь', 65], ['Э', 66], 
        ['Ю', 67], ['Я', 68]
    ];

    for (const [char, code] of symbols) {
        CHAR_CODE_TABLE[char.charCodeAt(0)] = code;
    }
})();

/**
 * Формирует запрос на запись комментария (0x15)
 * @param {number} channel - Номер канала (0-255)
 * @param {string} comment - Комментарий (до 16 символов)
 * @returns {Uint8Array} - PDU запроса
 * @throws {RangeError|TypeError|Error} При невалидных данных
 */
function buildWriteDeviceCommentRequest(channel, comment) {
    // Быстрая проверка канала
    if ((channel | 0) !== channel || channel < 0 || channel > MAX_CHANNEL) {
        throw new RangeError(`Channel must be 0-${MAX_CHANNEL}`);
    }

    if (typeof comment !== 'string') {
        throw new TypeError('Comment must be a string');
    }

    const trimmed = comment.trim().toUpperCase();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
        throw new Error(`Comment exceeds ${MAX_COMMENT_LENGTH} chars`);
    }

    // Создаем буфер сразу нужного размера
    const pdu = new Uint8Array(REQUEST_SIZE);
    
    // Заполняем заголовок напрямую (быстрее DataView)
    pdu[0] = FUNCTION_CODE;
    pdu[1] = channel;
    pdu[2] = MAX_COMMENT_LENGTH;

    // Кодируем символы через таблицу
    for (let i = 0; i < trimmed.length; i++) {
        const code = CHAR_CODE_TABLE[trimmed.charCodeAt(i)];
        if (code === undefined || code === 0) {
            throw new Error(`Unsupported character: "${trimmed[i]}"`);
        }
        pdu[3 + i] = code;
    }

    // Заполняем остаток пробелами (если нужно)
    if (trimmed.length < MAX_COMMENT_LENGTH) {
        pdu.fill(SPACE_CODE, 3 + trimmed.length);
    }

    return pdu;
}

/**
 * Разбирает ответ на запись комментария
 * @param {Uint8Array} pdu - Ответ устройства (3 байта)
 * @returns {{ channel: number, length: number }}
 * @throws {TypeError|Error} При неверном формате
 */
function parseWriteDeviceCommentResponse(pdu) {
    // Строгая проверка типа
    if (!(pdu?.constructor === Uint8Array)) {
        throw new TypeError(`Expected Uint8Array, got ${pdu?.constructor?.name || typeof pdu}`);
    }

    // Проверка размера и кода функции
    if (pdu.length !== RESPONSE_SIZE || pdu[0] !== FUNCTION_CODE) {
        const receivedCode = pdu[0]?.toString(16).padStart(2, '0') || 'null';
        throw new Error(`Invalid response: expected ${RESPONSE_SIZE} bytes (FC=0x${FUNCTION_CODE.toString(16)}), got ${pdu.length} bytes (FC=0x${receivedCode})`);
    }

    return {
        channel: pdu[1],
        length: pdu[2]
    };
}

module.exports = {
    buildWriteDeviceCommentRequest,
    parseWriteDeviceCommentResponse,
};