// modbus/utils/crc.ts

/**
 * Checksum calculation utilities implementing CRC algorithms
 * used in Modbus RTU and related industrial protocols.
 */

import { CRC16_MODBUS_TABLE } from '../constants/modbus.js';

// ====================== EXPORTED CRC FUNCTIONS ======================

/**
 * Calculates standard CRC16-MODBUS checksum (Polynomial 0xA001, Initial value 0xFFFF).
 * Appended to every Modbus RTU frame for data integrity verification.
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 2-byte Uint8Array containing `[Low Byte, High Byte]` in Modbus RTU transmission order.
 */
export const crc16Modbus = (data: Uint8Array): Uint8Array => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const index = (crc ^ data[i]!) & 0xff;
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[index]!;
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
};

/**
 * Calculates CRC16-CCITT-FALSE checksum (Polynomial 0x1021, Initial value 0xFFFF, no reflection).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 2-byte Uint8Array containing `[High Byte, Low Byte]`.
 */
export const crc16CcittFalse = (data: Uint8Array): Uint8Array => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return new Uint8Array([(crc >>> 8) & 0xff, crc & 0xff]);
};

/**
 * Calculates standard IEEE 802.3 CRC32 checksum (Polynomial 0xEDB88320, reflected).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 4-byte Uint8Array containing `[L, ML, MH, H]`.
 */
export const crc32 = (data: Uint8Array): Uint8Array => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  crc ^= 0xffffffff;
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
};

/**
 * Calculates CRC8 checksum (Polynomial 0x07, Initial value 0x00).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 1-byte Uint8Array containing the CRC8 checksum.
 */
export const crc8 = (data: Uint8Array): Uint8Array => {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80 ? (crc << 1) ^ 0x07 : crc << 1;
      crc &= 0xff;
    }
  }
  return new Uint8Array([crc]);
};

/**
 * Calculates CRC1 (Simple cumulative bit-wise parity check).
 *
 * @param data - The byte array over which to compute parity.
 * @returns A 1-byte Uint8Array containing the parity bit (0 or 1).
 */
export const crc1 = (data: Uint8Array): Uint8Array => {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < 8; j++) {
      crc ^= (data[i]! >> (7 - j)) & 0x01;
    }
  }
  return new Uint8Array([crc & 0x01]);
};

/**
 * Calculates Dallas/Maxim 1-Wire CRC8 checksum (Polynomial 0x8C, Reflected).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 1-byte Uint8Array containing the 1-Wire CRC8 checksum.
 */
export const crc8_1wire = (data: Uint8Array): Uint8Array => {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x01 ? (crc >>> 1) ^ 0x8c : crc >>> 1;
    }
  }
  return new Uint8Array([crc]);
};

/**
 * Calculates CRC8-DVB-S2 checksum (Polynomial 0xD5).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 1-byte Uint8Array containing the DVB-S2 CRC8 checksum.
 */
export const crc8_dvbs2 = (data: Uint8Array): Uint8Array => {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80 ? (crc << 1) ^ 0xd5 : crc << 1;
      crc &= 0xff;
    }
  }
  return new Uint8Array([crc]);
};

/**
 * Calculates CRC16-Kermit checksum (Polynomial 0x8408, Reflected).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 2-byte Uint8Array containing `[Low Byte, High Byte]`.
 */
export const crc16_kermit = (data: Uint8Array): Uint8Array => {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x0001 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
};

/**
 * Calculates CRC16-XModem checksum (Polynomial 0x1021, Initial value 0x0000).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 2-byte Uint8Array containing `[High Byte, Low Byte]`.
 */
export const crc16_xmodem = (data: Uint8Array): Uint8Array => {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return new Uint8Array([(crc >>> 8) & 0xff, crc & 0xff]);
};

/**
 * Calculates CRC24 checksum (Polynomial 0x864CFB, Initial value 0xB704CE).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 3-byte Uint8Array containing `[High Byte, Mid Byte, Low Byte]`.
 */
export const crc24 = (data: Uint8Array): Uint8Array => {
  let crc = 0xb704ce;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 16;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x800000 ? (crc << 1) ^ 0x864cfb : crc << 1;
      crc &= 0xffffff;
    }
  }
  return new Uint8Array([(crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
};

/**
 * Calculates CRC32-MPEG checksum (Polynomial 0x04C11DB7, Initial value 0xFFFFFFFF, no reflection).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 4-byte Uint8Array containing `[H, MH, ML, L]` in Big-Endian order.
 */
export const crc32mpeg = (data: Uint8Array): Uint8Array => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 24;
    crc = crc >>> 0;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
      crc = crc >>> 0;
    }
  }
  return new Uint8Array([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
};

/**
 * Calculates CRC-JAM checksum (Polynomial 0xEDB88320, Initial value 0xFFFFFFFF, no final XOR).
 *
 * @param data - The byte array over which to compute the CRC.
 * @returns A 4-byte Uint8Array containing `[L, ML, MH, H]`.
 */
export const crcjam = (data: Uint8Array): Uint8Array => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
};

// Final Isomorphic Default Export
export default {
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
