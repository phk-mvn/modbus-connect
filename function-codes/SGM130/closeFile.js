// function-codes/SGM130/closeFile.js

const FUNCTION_CODE = 0x57;
const EXPECTED_RESPONSE_SIZE = 1;

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

    const responseLength = response.length;
    
    if (responseLength === 0) {
        console.warn('⚠️ Empty response for Close File command (0x57)');
        return false;
    }

    if (responseLength !== EXPECTED_RESPONSE_SIZE || response[0] !== FUNCTION_CODE) {
        throw new Error(`Invalid response: expected [0x${FUNCTION_CODE.toString(16)}], got [${Array.from(response).map(b => '0x' + b.toString(16)).join(', ')}]`);
    }

    return true;
}

module.exports = {
    buildCloseFileRequest,
    parseCloseFileResponse
};