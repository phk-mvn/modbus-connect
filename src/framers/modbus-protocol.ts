// src/framers/modbus-protocol.ts
import { Transport } from '../types/modbus-types.js';
import { ModbusFramer } from './modbus-framer.js';
import { TcpFramer } from './tcp-framer.js';
import { ModbusTimeoutError, ModbusCRCError, ModbusResponseError } from '../errors.js';
import { concatUint8Arrays } from '../utils/utils.js';

export class ModbusProtocol {
  constructor(
    private _transport: Transport,
    private _framer: ModbusFramer
  ) {}

  public async exchange(
    unitId: number,
    pduRequest: Uint8Array,
    timeout: number
  ): Promise<Uint8Array> {
    const startTime = Date.now();
    const aduRequest = this._framer.buildAdu(unitId, pduRequest);
    const expectedLen = this._framer.getExpectedResponseLength(pduRequest);

    if (this._transport.flush) {
      await this._transport.flush();
    }

    await this._transport.write(aduRequest);

    // Явно указываем тип, чтобы избежать ошибки ArrayBufferLike
    let buffer: Uint8Array = new Uint8Array(0);
    const minLen = this._framer instanceof TcpFramer ? 7 : 4;

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new ModbusTimeoutError(`Response timeout after ${elapsed}ms`);
      }

      // Если мы знаем точную длину, читаем её сразу, иначе по 1 байту
      const bytesToRead = expectedLen ? Math.max(1, expectedLen - buffer.length) : 1;

      const chunk = await this._transport.read(bytesToRead, timeout - elapsed);

      if (chunk && chunk.length > 0) {
        // Используем приведение типа 'as Uint8Array', чтобы TS не ругался на ArrayBufferLike
        const combined = concatUint8Arrays([buffer, chunk]);
        buffer = combined as Uint8Array;
      }

      // Если накопили достаточно для минимального пакета, пробуем парсить
      if (buffer.length >= minLen) {
        try {
          const context =
            this._framer instanceof TcpFramer
              ? { transactionId: (this._framer as TcpFramer).currentTransactionId }
              : {};

          const { pdu: responsePdu } = this._framer.parseAdu(buffer, context);
          return responsePdu;
        } catch (err: unknown) {
          // Если это ошибка CRC или пакет слишком короткий - продолжаем чтение
          const isShort = err instanceof ModbusResponseError && err.message.includes('short');
          const isCrc = err instanceof ModbusCRCError;

          if (isCrc || isShort) {
            // Если мы уже прочитали столько, сколько ожидали (или больше), но пакет все еще битый - выходим с ошибкой
            if (expectedLen && buffer.length >= expectedLen) {
              throw err;
            }
            // Иначе продолжаем ждать данные
            continue;
          }
          throw err;
        }
      }
    }
  }

  public get transport(): Transport {
    return this._transport;
  }
  public get framer(): ModbusFramer {
    return this._framer;
  }
}
