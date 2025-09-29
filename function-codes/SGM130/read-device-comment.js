// function-codes/SGM130/read-device-comment.js

const FUNCTION_CODE = 0x14;
const MAX_CHANNEL = 255;
const MAX_COMMENT_LENGTH = 16;
const REQUEST_SIZE = 2;
const RESPONSE_HEADER_SIZE = 3;

// Таблица символов по спецификации (как в рабочей версии)
const SYMBOL_MAP = {
  0: ' ', 1: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9',
  11: 'A', 12: 'B', 13: 'C', 14: 'D', 15: 'E', 16: 'F', 17: 'G', 18: 'H', 19: 'I', 20: 'J', 
  21: 'K', 22: 'L', 23: 'M', 24: 'N', 25: 'O', 26: 'P', 27: 'Q', 28: 'R', 29: 'S', 30: 'T', 
  31: 'U', 32: 'V', 33: 'X', 34: 'Y', 35: 'Z',
  37: 'А', 38: 'Б', 39: 'В', 40: 'Г', 41: 'Д', 42: 'Е', 43: 'Ж', 44: 'З', 45: 'И', 46: 'Й',
  47: 'К', 48: 'Л', 49: 'М', 50: 'Н', 51: 'О', 52: 'П', 53: 'Р', 54: 'С', 55: 'Т', 56: 'У',
  57: 'Ф', 58: 'Х', 59: 'Ц', 60: 'Ч', 61: 'Ш', 62: 'Щ', 63: 'Ъ', 64: 'Ы', 65: 'Ь', 66: 'Э',
  67: 'Ю', 68: 'Я'
};

/**
 * Формирует запрос на чтение комментария устройства
 * @param {number} channel - Номер канала (0-255)
 * @returns {Uint8Array} - PDU запроса (2 байта)
 * @throws {RangeError} При неверном номере канала
 */
function buildReadDeviceCommentRequest(channel) {
  // Быстрая проверка через побитовые операции
  if ((channel | 0) !== channel || channel < 0 || channel > MAX_CHANNEL) {
    throw new RangeError(`Channel must be 0-${MAX_CHANNEL}`);
  }

  // Используем статический массив для исключения лишних аллокаций
  return new Uint8Array([FUNCTION_CODE, channel]);
}

/**
 * Разбирает ответ с комментарием устройства
 * @param {Uint8Array} pdu - PDU ответа
 * @returns {{
 *   channel: number,
 *   raw: Uint8Array,
 *   comment: string
 * }}
 * @throws {TypeError|Error} При неверном формате данных
 */
function parseReadDeviceCommentResponse(pdu) {
  // Строгая проверка типа (без try/catch)
  if (!(pdu?.constructor === Uint8Array)) {
    throw new TypeError(`Expected Uint8Array, got ${pdu?.constructor?.name || typeof pdu}`);
  }

  const pduLength = pdu.length;
  if (pduLength < RESPONSE_HEADER_SIZE) {
    throw new Error(`PDU too short: expected at least ${RESPONSE_HEADER_SIZE} bytes, got ${pduLength}`);
  }

  // Проверка кода функции
  if (pdu[0] !== FUNCTION_CODE) {
    const receivedCode = pdu[0]?.toString(16).padStart(2, '0') || 'null';
    throw new Error(`Invalid function code: expected 0x${FUNCTION_CODE.toString(16)}, got 0x${receivedCode}`);
  }

  const channel = pdu[1];
  const length = pdu[2];

  // Проверка длины комментария
  if (length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment length exceeds limit: max ${MAX_COMMENT_LENGTH}, got ${length}`);
  }

  // Проверка общего размера PDU
  const expectedLength = RESPONSE_HEADER_SIZE + length;
  if (pduLength < expectedLength) {
    throw new Error(`PDU truncated: expected ${expectedLength} bytes, got ${pduLength}`);
  }

  // Оптимизированное чтение данных
  const buffer = pdu.buffer || pdu;
  const byteOffset = (pdu.byteOffset || 0) + RESPONSE_HEADER_SIZE;
  const rawData = new Uint8Array(buffer, byteOffset, length);

  // Преобразование символов через таблицу (как в рабочей версии)
  const comment = Array.from(rawData).map(b => SYMBOL_MAP[b] || '').join('');

  return {
    channel,
    raw: rawData, // Возвращаем Uint8Array вместо Array для производительности
    comment: comment
  };
}

module.exports = {
  buildReadDeviceCommentRequest,
  parseReadDeviceCommentResponse,
};