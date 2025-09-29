// function-codes/SGM130/restart-controller.js

const FUNCTION_CODE = 0x5C; // Код функции RESTART_CONTROLLER

/**
 * Строит PDU запроса на перезапуск контроллера
 * @returns {Uint8Array} - PDU запроса (ровно 1 байт)
 */
function buildRestartControllerRequest() {
    // Используем статический буфер для повторного использования
    const request = new Uint8Array(1);
    request[0] = FUNCTION_CODE;
    return request;
}

/**
 * Обрабатывает ответ на команду перезапуска (по спецификации ответа быть не должно)
 * @param {Uint8Array|null} pdu - Полученный PDU ответа (если есть)
 * @returns {{success: boolean, warning?: string}}
 */
function parseRestartControllerResponse(pdu = null) {
    // Оптимизированная проверка на неожиданный ответ
    if (pdu?.length) {
        const warning = `Unexpected ${pdu.length}-byte response for restart command`;
        return { success: true, warning }; // Все равно считаем успешным, но с предупреждением
    }
    return { success: true };
}

module.exports = {
    buildRestartControllerRequest,
    parseRestartControllerResponse
};