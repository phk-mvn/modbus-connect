// function-codes/SGM130/closeFile.js

const FUNCTION_CODE = 0x57;

/**
 * Строит PDU-запрос для закрытия файла (Close File)
 * @returns {Uint8Array}
 */
function buildCloseFileRequest() {
    // Используем статический Uint8Array для избежания лишних аллокаций
    const request = new Uint8Array(1);
    request[0] = FUNCTION_CODE;
    return request;
}

/**
 * Разбирает PDU-ответ на закрытие файла
 * @param {Uint8Array} response
 * @returns {boolean} - true, если ответ валиден
 * @throws {TypeError} Если ответ не является Uint8Array
 * @throws {Error} Если ответ имеет неправильную длину или код функции
 */
function parseCloseFileResponse(response) {
    if (!(response instanceof Uint8Array)) {
        throw new TypeError('Response must be Uint8Array');
    }

    // Устройство может не возвращать ответ или возвращать пустой ответ
    if (response.length === 0) {
        console.warn('⚠️ Empty response for Close File command (0x57) - device may have closed file automatically');
        return true; // Считаем, что файл закрыт
    }

    // Проверяем, что первый байт - код функции
    if (response[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid response: expected [0x${FUNCTION_CODE.toString(16)}], got [0x${response[0].toString(16)}]`);
    }

    return true;
}

module.exports = {
    buildCloseFileRequest,
    parseCloseFileResponse
};