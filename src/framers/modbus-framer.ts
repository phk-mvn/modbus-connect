// src/framers/modbus-framer.ts

/**
 * Контекст для разбора ответа (например, чтобы проверить соответствие Transaction ID в TCP)
 */
export interface FramerContext {
  transactionId?: number;
}

/**
 * Общий интерфейс для формирования и разбора пакетов (ADU)
 */
export interface ModbusFramer {
  /**
   * Обертывает PDU в заголовок/контрольную сумму (ADU)
   */
  buildAdu(unitId: number, pdu: Uint8Array): Uint8Array;

  /**
   * Извлекает PDU из сырого пакета, проверяет целостность (CRC/MBAP)
   */
  parseAdu(data: Uint8Array, context?: FramerContext): { unitId: number; pdu: Uint8Array };

  /**
   * Вычисляет ожидаемую длину всего ADU пакета на основе PDU запроса
   */
  getExpectedResponseLength(requestPdu: Uint8Array): number | null;
}
