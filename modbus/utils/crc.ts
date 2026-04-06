// modbus/utils/crc.ts

/**
 * Pre-computed lookup table for CRC16-MODBUS (Polynomial 0xA001).
 */
const CRC16_MODBUS_TABLE = new Uint16Array([
  0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241, 0xc601, 0x06c0, 0x0780, 0xc741,
  0x0500, 0xc5c1, 0xc481, 0x0440, 0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40,
  0x0a00, 0xcac1, 0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841, 0xd801, 0x18c0, 0x1980, 0xd941,
  0x1b00, 0xdbc1, 0xda81, 0x1a40, 0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41,
  0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641, 0xd201, 0x12c0, 0x1380, 0xd341,
  0x1100, 0xd1c1, 0xd081, 0x1040, 0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240,
  0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441, 0x3c00, 0xfcc1, 0xfd81, 0x3d40,
  0xff01, 0x3fc0, 0x3e80, 0xfe41, 0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840,
  0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41, 0xee01, 0x2ec0, 0x2f80, 0xef41,
  0x2d00, 0xedc1, 0xec81, 0x2c40, 0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640,
  0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041, 0xa001, 0x60c0, 0x6180, 0xa141,
  0x6300, 0xa3c1, 0xa281, 0x6240, 0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480, 0xa441,
  0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41, 0xaa01, 0x6ac0, 0x6b80, 0xab41,
  0x6900, 0xa9c1, 0xa881, 0x6840, 0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
  0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40, 0xb401, 0x74c0, 0x7580, 0xb541,
  0x7700, 0xb7c1, 0xb681, 0x7640, 0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041,
  0x5000, 0x90c1, 0x9181, 0x5140, 0x9301, 0x53c0, 0x5280, 0x9241, 0x9601, 0x56c0, 0x5780, 0x9741,
  0x5500, 0x95c1, 0x9481, 0x5440, 0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40,
  0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841, 0x8801, 0x48c0, 0x4980, 0x8941,
  0x4b00, 0x8bc1, 0x8a81, 0x4a40, 0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41,
  0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641, 0x8201, 0x42c0, 0x4380, 0x8341,
  0x4100, 0x81c1, 0x8081, 0x4040,
]);

// ====================== EXPORTED CRC FUNCTIONS ======================

/** Calculates CRC16-MODBUS (Polynomial 0xA001, Init 0xFFFF). Result: [Low, High] */
export const crc16Modbus = (data: Uint8Array): Uint8Array => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const index = (crc ^ data[i]!) & 0xff;
    crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[index]!;
  }
  return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
};

/** Calculates CRC16-CCITT-FALSE (Polynomial 0x1021, Init 0xFFFF). Result: [High, Low] */
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

/** Calculates CRC32 (Polynomial 0xEDB88320). Result: [L, ML, MH, H] */
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

/** Calculates CRC8 (Polynomial 0x07). */
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

/** Calculates CRC1 (Simple bit-wise parity). */
export const crc1 = (data: Uint8Array): Uint8Array => {
  let crc = 0x00;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < 8; j++) {
      crc ^= (data[i]! >> (7 - j)) & 0x01;
    }
  }
  return new Uint8Array([crc & 0x01]);
};

/** Calculates CRC8-1WIRE (Polynomial 0x8C, Reflected). */
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

/** Calculates CRC8-DVB-S2 (Polynomial 0xD5). */
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

/** Calculates CRC16-Kermit (Polynomial 0x8408, Reflected). Result: [Low, High] */
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

/** Calculates CRC16-XModem (Polynomial 0x1021). Result: [High, Low] */
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

/** Calculates CRC24 (Polynomial 0x864CFB). Result: [H, M, L] */
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

/** Calculates CRC32-MPEG (Polynomial 0x04C11DB7). Result: [H, MH, ML, L] */
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

/** Calculates CRC-JAM (Polynomial 0xEDB88320, No final XOR). Result: [L, ML, MH, H] */
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
