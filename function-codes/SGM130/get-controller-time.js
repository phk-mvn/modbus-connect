// function-codes/SGM130/get-controller-time.js

const FUNCTION_CODE = 0x6E; // GET_CONTROLLER_TIME
const EXPECTED_RESPONSE_SIZE = 10;
const DATA_OFFSET = 3;

// Оптимизированный объект смещений (заморожен для защиты от изменений)
const TIME_FIELDS_OFFSET = Object.freeze({
    SECONDS: 0,
    MINUTES: 1,
    HOURS: 2,
    DAY: 3,
    MONTH: 4,
    YEAR_LOW: 5,
    YEAR_HIGH: 6
});

/**
 * Формирует PDU-запрос времени контроллера (минимальный размер)
 * @returns {Uint8Array} - 1 байт (код функции)
 */
function buildGetControllerTimeRequest() {
    // Используем статический массив для исключения лишних аллокаций
    const request = new Uint8Array([FUNCTION_CODE]);
    return request;
}

/**
 * Разбирает PDU-ответ с временем контроллера (оптимизированная версия)
 * @param {Uint8Array} pdu - ответ устройства (10 байт)
 * @returns {{
 *   seconds: number,
 *   minutes: number,
 *   hours: number,
 *   day: number,
 *   month: number,
 *   year: number
 * }}
 * @throws {TypeError|Error} - при неверном формате данных
 */
function parseGetControllerTimeResponse(pdu) {
    // Быстрая проверка типа (без try/catch для производительности)
    if (!(pdu instanceof Uint8Array)) {
        throw new TypeError(`Expected Uint8Array, got ${pdu?.constructor?.name || typeof pdu}`);
    }

    // Проверка размера и кода функции в одном условии
    if (pdu.length !== EXPECTED_RESPONSE_SIZE || pdu[0] !== FUNCTION_CODE) {
        const hexCode = pdu[0]?.toString(16).padStart(2, '0') || 'null';
        throw new Error(`Invalid response: expected ${EXPECTED_RESPONSE_SIZE} bytes with FC=0x${FUNCTION_CODE.toString(16)}, got ${pdu.length} bytes with FC=0x${hexCode}`);
    }

    // Доступ к буферу без копирования
    const buffer = pdu.buffer || pdu;
    const byteOffset = (pdu.byteOffset || 0) + DATA_OFFSET;
    
    // Используем DataView только если нужно (проверка выравнивания)
    let seconds, minutes, hours, day, month, year;
    
    if (byteOffset % 1 === 0) { // Проверка выравнивания для Uint8Array
        const dataView = new Uint8Array(buffer, byteOffset, 7);
        seconds = dataView[TIME_FIELDS_OFFSET.SECONDS];
        minutes = dataView[TIME_FIELDS_OFFSET.MINUTES];
        hours = dataView[TIME_FIELDS_OFFSET.HOURS];
        day = dataView[TIME_FIELDS_OFFSET.DAY];
        month = dataView[TIME_FIELDS_OFFSET.MONTH];
        year = dataView[TIME_FIELDS_OFFSET.YEAR_LOW] | (dataView[TIME_FIELDS_OFFSET.YEAR_HIGH] << 8);
    } else {
        const view = new DataView(buffer, byteOffset);
        seconds = view.getUint8(TIME_FIELDS_OFFSET.SECONDS);
        minutes = view.getUint8(TIME_FIELDS_OFFSET.MINUTES);
        hours = view.getUint8(TIME_FIELDS_OFFSET.HOURS);
        day = view.getUint8(TIME_FIELDS_OFFSET.DAY);
        month = view.getUint8(TIME_FIELDS_OFFSET.MONTH);
        year = view.getUint8(TIME_FIELDS_OFFSET.YEAR_LOW) | (view.getUint8(TIME_FIELDS_OFFSET.YEAR_HIGH) << 8);
    }

    return { seconds, minutes, hours, day, month, year };
}

module.exports = {
    buildGetControllerTimeRequest,
    parseGetControllerTimeResponse,
    // Экспортируем константы для тестов
    _TEST_CONSTANTS: { FUNCTION_CODE, EXPECTED_RESPONSE_SIZE }
};