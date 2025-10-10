// src/utils/crc.ts

const CRC16_TABLE: Uint16Array = new Uint16Array(256);
(function initCrc16Table(): void {
  for (let i: number = 0; i < 256; i++) {
    let crc: number = i;
    for (let j: number = 0; j < 8; j++) {
      crc = crc & 0x0001 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
    CRC16_TABLE[i] = crc;
  }
})();

/**
 * Calculates CRC16-MODBUS (polynomial 0xA001, init 0xFFFF, no reflection) for the given Uint8Array.
 * @param buffer - input data to calculate CRC16-MODBUS
 * @returns 2-byte array with CRC16-MODBUS in big-endian format
 */
function crc16Modbus(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xffff;
  for (let i: number = 0; i < buffer.length; i++) {
    const byte: number = buffer[i]!;
    const index: number = (crc ^ byte) & 0xff; // Clean number 0-255
    crc = (crc >> 8) ^ CRC16_TABLE[index]!;
  }
  return new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);
}

/**
 * Calculates CRC16-CCITT-FALSE (polynomial 0x1021, init 0xFFFF, no reflection) for the given Uint8Array.
 * @param buffer - input data to calculate CRC16-CCITT-FALSE
 * @returns 2-byte array with CRC16-CCITT-FALSE in big-endian format
 */
function crc16CcittFalse(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xffff;
  for (let pos: number = 0; pos < buffer.length; pos++) {
    crc ^= (buffer[pos] as number) << 8; // as number: explicit cast for shift, safe in loop
    for (let i: number = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff; // Ограничение 16 бит
    }
  }
  return new Uint8Array([(crc >> 8) & 0xff, crc & 0xff]); // Big-endian
}

/**
 * Calculates CRC32 (polynomial 0x04C11DB7, init 0xFFFFFFFF, reflection and final XOR) for the given Uint8Array.
 * @param buffer - input data to calculate CRC32
 * @returns 4-byte array with CRC32 in little-endian format
 */
function crc32(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xffffffff;
  for (let pos: number = 0; pos < buffer.length; pos++) {
    crc ^= buffer[pos]!; // !: non-null, pos < length
    for (let i: number = 0; i < 8; i++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  crc ^= 0xffffffff;
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]); // Little-endian
}

/**
 * Calculates CRC8 (polynomial 0x07, init 0x00, no reflection) for the given Uint8Array.
 * @param buffer - input data to calculate CRC8
 * @returns 1-byte array with CRC8 in big-endian format
 */
function crc8(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x00;
  for (let pos: number = 0; pos < buffer.length; pos++) {
    crc ^= buffer[pos]!; // !: non-null, pos < length
    for (let i: number = 0; i < 8; i++) {
      if ((crc & 0x80) !== 0) {
        crc = (crc << 1) ^ 0x07;
      } else {
        crc <<= 1;
      }
      crc &= 0xff; // Ограничение 8 бит
    }
  }
  return new Uint8Array([crc]);
}

/**
 * Calculates CRC-1 (simplest CRC, polynomial 0x01, init 0x00) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-1
 * @returns 1-byte array with CRC-1 in big-endian format
 */
function crc1(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x00;
  for (const byte of buffer) {
    for (let i: number = 0; i < 8; i++) {
      crc ^= (byte >> (7 - i)) & 0x01;
    }
  }
  return new Uint8Array([crc & 0x01]);
}

/**
 * Calculates CRC-8 1-Wire (polynomial 0x31, init 0x00, reflection, no final XOR) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-8 1-Wire
 * @returns 1-byte array with CRC-8 1-Wire in big-endian format
 */
function crc8_1wire(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x00;
  for (const b of buffer) {
    crc ^= b;
    for (let i: number = 0; i < 8; i++) {
      if (crc & 0x01) {
        crc = (crc >> 1) ^ 0x8c; // отражённый 0x31 → 0x8C
      } else {
        crc >>= 1;
      }
    }
  }
  return new Uint8Array([crc]);
}

/**
 * Calculates CRC-8 DVB-S2 (polynomial 0xD5, init 0x00, no reflection and final XOR) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-8 DVB-S2
 * @returns 1-byte array with CRC-8 DVB-S2 in big-endian format
 */
function crc8_dvbs2(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x00;
  for (const b of buffer) {
    crc ^= b;
    for (let i: number = 0; i < 8; i++) {
      crc = crc & 0x80 ? (crc << 1) ^ 0xd5 : crc << 1;
      crc &= 0xff;
    }
  }
  return new Uint8Array([crc]);
}

/**
 * Calculates CRC-16 Kermit (polynomial 0x1021, init 0x0000, reflection, final XOR = 0x0000) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-16 Kermit
 * @returns 2-byte array with CRC-16 Kermit in big-endian format
 */
function crc16_kermit(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x0000;
  for (const b of buffer) {
    crc ^= b;
    for (let i: number = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0x8408; // отражённый 0x1021
      } else {
        crc >>= 1;
      }
    }
  }
  return new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);
}

/**
 * Calculates CRC-16 XModem (polynomial 0x1021, init 0x0000, no reflection) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-16 XModem
 * @returns 2-byte array with CRC-16 XModem in big-endian format
 */
function crc16_xmodem(buffer: Uint8Array): Uint8Array {
  let crc: number = 0x0000;
  for (const b of buffer) {
    crc ^= b << 8;
    for (let i: number = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return new Uint8Array([(crc >> 8) & 0xff, crc & 0xff]);
}

/**
 * Calculates CRC-24 (polynomial 0x864CFB, init 0xB704CE) — часто используется в Bluetooth, OpenPGP
 * @param buffer - input data to calculate CRC-24
 * @returns 3-byte array with CRC-24 in big-endian format
 */
function crc24(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xb704ce;
  for (const b of buffer) {
    crc ^= b << 16;
    for (let i: number = 0; i < 8; i++) {
      crc = crc & 0x800000 ? (crc << 1) ^ 0x864cfb : crc << 1;
      crc &= 0xffffff;
    }
  }
  return new Uint8Array([(crc >> 16) & 0xff, (crc >> 8) & 0xff, crc & 0xff]);
}

/**
 * Calculates CRC-32 MPEG-2 (polynomial 0x04C11DB7, init 0xFFFFFFFF, no reflection, final XOR = 0x00000000) for the given Uint8Array.
 * @param buffer - input data to calculate CRC-32 MPEG-2
 * @returns 4-byte array with CRC-32 MPEG-2 in little-endian format
 */
function crc32mpeg(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xffffffff;
  for (const b of buffer) {
    crc ^= b << 24;
    for (let i: number = 0; i < 8; i++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
      crc >>>= 0; // Принудительно как unsigned 32-bit
    }
  }
  return new Uint8Array([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
}

/**
 * Calculates CRC-JAM (иногда называют CRC-32-JAMCRC, как CRC-32, но без финального XOR)
 * @param buffer - input data to calculate CRC-JAM
 * @returns 4-byte array with CRC-JAM in little-endian format
 */
function crcjam(buffer: Uint8Array): Uint8Array {
  let crc: number = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let i: number = 0; i < 8; i++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
}

export {
  crc16Modbus,
  crc16CcittFalse,
  crc32,
  crc8,
  crc1,
  crc8_1wire,
  crc8_dvbs2,
  crc16_kermit,
  crc16_xmodem,
  crc24,
  crc32mpeg,
  crcjam,
};
