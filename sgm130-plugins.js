// === КОНСТАНТЫ ===
const RECORD_SIZE_130 = 16;
const RECORD_SIZE_110 = 9;

// Карта событий для ОБЫЧНЫХ КАНАЛОВ (Битовая маска)
const CH_EVENT_MAP = [
  'авария',
  'порог 1',
  'порог 2',
  'кнопка "Сброс"',
  'режим "Обслуживание"',
  'превышение сигнала',
  'идёт инициализация модуля',
  'нет связи',
  'ошибка АЦП',
  'блокировка звука',
  'сервисный режим',
  'предупреждение "Warning"',
  'нет связи с датчиком',
  'авария(проблемы с датчиком)',
  'порог 3',
  'загрязнение оптики',
];

// Карта событий для файла NS.arh (СГМ130)
const NS_EVENT_MAP_130 = [
  'нет', // 0
  'Отказ датчика (сенсора)/ Авария', // 1
  'Сработал порог 1', // 2
  'Сработал порог 2', // 3
  'Превышение сигнала', // 4
  'Режим «обслуживание» / Сервисный режим', // 5
  'Ошибка связи', // 6
  'Выход из нештатной ситуации', // 7
  'Включение прибора', // 8
  'Выключение прибора', // 9
  'Сброс времени', // 10
  'Отказ АЦП', // 11
  'Блокировка звука / Квитирование', // 12
  '"Warning"', // 13
  '"Alarm"', // 14
  '"Low Signal"', // 15
  '"Beam-Block"', // 16
  '"Off-Line"', // 17
  'Нет связи с сенсором', // 18
  'Сработал порог 3', // 19
  'резерв', // 20
  'Базовые настройки контроллера по умолчанию', // 21
  'Настройки канала по умолчанию', // 22
  'Настройки каналов по умолчанию', // 23
  'Перезагрузка контроллера', // 24
];

// Карта событий для файла NS.arh (MAP110) - взято из C# events_MAP
const NS_EVENT_MAP_110 = [
  'ОК', // 0
  'Отказ сенсора', // 1
  'Сработал порог 1 ', // 2
  'Сработал порог 2 ', // 3
  'Превышение сигнала ', // 4
  'Обслуживание ', // 5
  'Ошибка связи ', // 6
  'Выход из нештатной ситуации', // 7
  'Включение прибора', // 8
  'Выключение прибора ', // 9
  'Сброс времени', // 10
  'Отказ АЦП', // 11
  'Блокировка звука ', // 12
  'Временное отключение канала', // 13
  'Включение канала ', // 14
];

class SGMFilePlugin {
  constructor() {
    this.name = 'sgm-file-operations-plugin';

    // Определение функций Modbus
    this.customFunctionCodes = {
      openFile: {
        buildRequest: filename => {
          const enc = new TextEncoder().encode(filename);
          const pdu = new Uint8Array(1 + 1 + enc.length + 1);
          pdu[0] = 0x55;
          pdu[1] = enc.length;
          pdu.set(enc, 2);
          pdu[pdu.length - 1] = 0x00;
          return pdu;
        },
        parseResponse: responsePdu => {
          if (responsePdu.length < 5) throw new Error('Plugin Error: OpenFile response too short');
          const view = new DataView(
            responsePdu.buffer,
            responsePdu.byteOffset,
            responsePdu.byteLength
          );
          return view.getUint32(1, false);
        },
      },

      readFileChunk: {
        buildRequest: chunkIdx => {
          const pdu = new Uint8Array(3);
          pdu[0] = 0x5a;
          pdu[1] = (chunkIdx >> 8) & 0xff;
          pdu[2] = chunkIdx & 0xff;
          return pdu;
        },
        parseResponse: pdu => {
          if (pdu.length < 3) throw new Error('Plugin Error: ReadChunk response too short');
          const view = new DataView(pdu.buffer, pdu.byteOffset, pdu.byteLength);
          const dataSize = view.getUint16(1, false);
          return { data: pdu.subarray(3, 3 + dataSize) };
        },
      },

      closeFile: {
        buildRequest: () => new Uint8Array([0x57]),
        parseResponse: () => true,
      },

      setControllerTime: {
        buildRequest: time => {
          if (!time || typeof time !== 'object') throw new Error('Plugin Error: Invalid time');

          let t =
            time instanceof Date
              ? {
                  seconds: time.getSeconds(),
                  minutes: time.getMinutes(),
                  hours: time.getHours(),
                  day: time.getDate(),
                  month: time.getMonth() + 1,
                  year: time.getFullYear(),
                }
              : time;

          const pdu = new Uint8Array(10);
          pdu[0] = 0x6f;
          pdu[1] = 0x00;
          pdu[2] = 0x00;
          pdu[3] = t.seconds;
          pdu[4] = t.minutes;
          pdu[5] = t.hours;
          pdu[6] = t.day;
          pdu[7] = t.month;
          pdu[8] = t.year & 0xff;
          pdu[9] = (t.year >> 8) & 0xff;
          return pdu;
        },
        parseResponse: responsePdu => responsePdu[0] === 0x6f,
      },

      // old_readDeviceComment: {
      //   buildRequest: (channel) => new Uint8Array([0x14, channel]),
      //   parseResponse: (pdu) => {
      //     const SYMBOL_MAP = {
      //       0: ' ', 1: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9',
      //       11: 'A', 12: 'B', 13: 'C', 14: 'D', 15: 'E', 16: 'F', 17: 'G', 18: 'H', 19: 'I', 20: 'J',
      //       21: 'K', 22: 'L', 23: 'M', 24: 'N', 25: 'O', 26: 'P', 27: 'Q', 28: 'R', 29: 'S', 30: 'T',
      //       31: 'U', 32: 'V', 33: 'X', 34: 'Y', 35: 'Z',
      //       37: 'А', 38: 'Б', 39: 'В', 40: 'Г', 41: 'Д', 42: 'Е', 43: 'Ж', 44: 'З', 45: 'И', 46: 'Й',
      //       47: 'К', 48: 'Л', 49: 'М', 50: 'Н', 51: 'О', 52: 'П', 53: 'Р', 54: 'С', 55: 'Т', 56: 'У',
      //       57: 'Ф', 58: 'Х', 59: 'Ц', 60: 'Ч', 61: 'Ш', 62: 'Щ', 63: 'Ъ', 64: 'Ы', 65: 'Ь', 66: 'Э',
      //       67: 'Ю', 68: 'Я'
      //     };
      //     const channel = pdu[1];
      //     const length = pdu[2];
      //     const rawData = pdu.subarray(3, 3 + length);
      //     const comment = Array.from(rawData).map(b => SYMBOL_MAP[b] || '').join('');
      //     return { channel, raw: new Uint8Array(rawData), comment };
      //   }
      // },

      old_readDeviceComment: {
        buildRequest: channel => new Uint8Array([0x14, channel]),
        parseResponse: pdu => {
          // Возвращаем чистый HEX (строку) без парсинга кодировок
          return Array.from(pdu)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
        },
      },

      old_writeDeviceComment: {
        buildRequest: args => {
          const CHAR_TO_CODE = {
            ' ': 0,
            0: 1,
            1: 2,
            2: 3,
            3: 4,
            4: 5,
            5: 6,
            6: 7,
            7: 8,
            8: 9,
            9: 10,
            A: 11,
            B: 12,
            C: 13,
            D: 14,
            E: 15,
            F: 16,
            G: 17,
            H: 18,
            I: 19,
            J: 20,
            K: 21,
            L: 22,
            M: 23,
            N: 24,
            O: 25,
            P: 26,
            Q: 27,
            R: 28,
            S: 29,
            T: 30,
            U: 31,
            V: 32,
            X: 33,
            Y: 34,
            Z: 35,
            А: 37,
            Б: 38,
            В: 39,
            Г: 40,
            Д: 41,
            Е: 42,
            Ж: 43,
            З: 44,
            И: 45,
            Й: 46,
            К: 47,
            Л: 48,
            М: 49,
            Н: 50,
            О: 51,
            П: 52,
            Р: 53,
            С: 54,
            Т: 55,
            У: 56,
            Ф: 57,
            Х: 58,
            Ц: 59,
            Ч: 60,
            Ш: 61,
            Щ: 62,
            Ъ: 63,
            Ы: 64,
            Ь: 65,
            Э: 66,
            Ю: 67,
            Я: 68,
          };
          const { channel, comment } = args;
          const trimmed = comment.trim().toUpperCase().slice(0, 16);
          const pdu = new Uint8Array(19);
          pdu[0] = 0x15;
          pdu[1] = channel;
          pdu[2] = 16;
          for (let i = 0; i < trimmed.length; i++) {
            pdu[3 + i] = CHAR_TO_CODE[trimmed[i]] ?? 0;
          }
          return pdu;
        },
        parseResponse: pdu => ({ channel: pdu[1], length: pdu[2] }),
      },
    };
  }

  static decodeSGMTime(time) {
    const sec = time & 0x3f;
    const min = (time >> 6) & 0x3f;
    const hour = (time >> 12) & 0x1f;
    const day = (time >> 17) & 0x1f;
    const month = (time >> 22) & 0x0f;
    const year = (time >> 26) & 0x3f;

    const f = n => n.toString().padStart(2, '0');
    return `${f(hour)}:${f(min)}:${f(sec)} ${f(day)}.${f(month)}.${f(year)}`;
  }

  /**
   * Логика декодирования событий
   */
  static decodeEvent(value, isNsFile, isMap110) {
    if (isNsFile) {
      // Логика для NS.arh: выбираем таблицу в зависимости от прибора
      const map = isMap110 ? NS_EVENT_MAP_110 : NS_EVENT_MAP_130;
      const eventText = map[value] || `Неизвестное событие (${value})`;
      return '. ' + eventText;
    } else {
      // Логика для chX.arh: Битовая маска
      let result = '';
      for (let nb = 0; nb < 8; nb++) {
        if ((value & (1 << nb)) > 0) {
          result += (result ? ' ' : '') + '. ' + CH_EVENT_MAP[nb];
        }
      }
      return result || '. ОК';
    }
  }

  /**
   * Публичный метод для парсинга накопленного буфера архива
   */
  static parseArchiveBuffer(
    buffer,
    limit,
    isNsFile = false,
    isMap110 = false,
    discretnessMap = {}
  ) {
    const records = [];
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Определяем размер записи
    const recordSize = isMap110 ? RECORD_SIZE_110 : RECORD_SIZE_130;

    // Смещения
    const offsetTime = isMap110 ? 1 : 4;
    const offsetChannel = isMap110 ? 5 : 8;
    const offsetValue = isMap110 ? 6 : 10;
    const offsetEvent = isMap110 ? 8 : 12;

    for (let offset = 0; offset <= buffer.byteLength - recordSize; offset += recordSize) {
      try {
        const rawTs = view.getInt32(offset + offsetTime, true);

        // Фильтрация пустых записей
        if (rawTs === 0) continue;

        // В архиве канал 0-based (0..N), для юзера 1-based.
        const rawChannelByte = view.getUint8(offset + offsetChannel);
        const userChannel = rawChannelByte + 1;

        const rawVal = view.getUint16(offset + offsetValue, true);
        const rawState = view.getUint8(offset + offsetEvent);

        const discPower = discretnessMap[rawChannelByte] ?? 1;
        const divisor = Math.pow(10, discPower);
        const formattedValue = (rawVal / divisor).toFixed(discPower);

        records.push({
          date: this.decodeSGMTime(rawTs),
          channel: userChannel,
          value: formattedValue,
          event: this.decodeEvent(rawState, isNsFile, isMap110),
          _rawTs: rawTs,
        });
      } catch (e) {
        // Игнорируем ошибки парсинга конкретной записи
      }
    }

    if (limit) {
      records.sort((a, b) => b._rawTs - a._rawTs);
      return records.slice(0, limit);
    }

    return records;
  }
}

module.exports = { SGMFilePlugin };
