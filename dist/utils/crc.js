"use strict";
// modbus/utils/crc.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.crcjam = exports.crc32mpeg = exports.crc24 = exports.crc16_xmodem = exports.crc16_kermit = exports.crc8_dvbs2 = exports.crc8_1wire = exports.crc1 = exports.crc8 = exports.crc32 = exports.crc16CcittFalse = exports.crc16Modbus = void 0;
const constants_1 = require("../constants/constants");
// ====================== EXPORTED CRC FUNCTIONS ======================
/** Calculates CRC16-MODBUS (Polynomial 0xA001, Init 0xFFFF). Result: [Low, High] */
const crc16Modbus = (data) => {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
        const index = (crc ^ data[i]) & 0xff;
        crc = (crc >>> 8) ^ constants_1.CRC16_MODBUS_TABLE[index];
    }
    return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
};
exports.crc16Modbus = crc16Modbus;
/** Calculates CRC16-CCITT-FALSE (Polynomial 0x1021, Init 0xFFFF). Result: [High, Low] */
const crc16CcittFalse = (data) => {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
            crc &= 0xffff;
        }
    }
    return new Uint8Array([(crc >>> 8) & 0xff, crc & 0xff]);
};
exports.crc16CcittFalse = crc16CcittFalse;
/** Calculates CRC32 (Polynomial 0xEDB88320). Result: [L, ML, MH, H] */
const crc32 = (data) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    crc ^= 0xffffffff;
    return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
};
exports.crc32 = crc32;
/** Calculates CRC8 (Polynomial 0x07). */
const crc8 = (data) => {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x80 ? (crc << 1) ^ 0x07 : crc << 1;
            crc &= 0xff;
        }
    }
    return new Uint8Array([crc]);
};
exports.crc8 = crc8;
/** Calculates CRC1 (Simple bit-wise parity). */
const crc1 = (data) => {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < 8; j++) {
            crc ^= (data[i] >> (7 - j)) & 0x01;
        }
    }
    return new Uint8Array([crc & 0x01]);
};
exports.crc1 = crc1;
/** Calculates CRC8-1WIRE (Polynomial 0x8C, Reflected). */
const crc8_1wire = (data) => {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x01 ? (crc >>> 1) ^ 0x8c : crc >>> 1;
        }
    }
    return new Uint8Array([crc]);
};
exports.crc8_1wire = crc8_1wire;
/** Calculates CRC8-DVB-S2 (Polynomial 0xD5). */
const crc8_dvbs2 = (data) => {
    let crc = 0x00;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x80 ? (crc << 1) ^ 0xd5 : crc << 1;
            crc &= 0xff;
        }
    }
    return new Uint8Array([crc]);
};
exports.crc8_dvbs2 = crc8_dvbs2;
/** Calculates CRC16-Kermit (Polynomial 0x8408, Reflected). Result: [Low, High] */
const crc16_kermit = (data) => {
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x0001 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
        }
    }
    return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff]);
};
exports.crc16_kermit = crc16_kermit;
/** Calculates CRC16-XModem (Polynomial 0x1021). Result: [High, Low] */
const crc16_xmodem = (data) => {
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
            crc &= 0xffff;
        }
    }
    return new Uint8Array([(crc >>> 8) & 0xff, crc & 0xff]);
};
exports.crc16_xmodem = crc16_xmodem;
/** Calculates CRC24 (Polynomial 0x864CFB). Result: [H, M, L] */
const crc24 = (data) => {
    let crc = 0xb704ce;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 16;
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x800000 ? (crc << 1) ^ 0x864cfb : crc << 1;
            crc &= 0xffffff;
        }
    }
    return new Uint8Array([(crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
};
exports.crc24 = crc24;
/** Calculates CRC32-MPEG (Polynomial 0x04C11DB7). Result: [H, MH, ML, L] */
const crc32mpeg = (data) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 24;
        crc = crc >>> 0;
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
            crc = crc >>> 0;
        }
    }
    return new Uint8Array([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]);
};
exports.crc32mpeg = crc32mpeg;
/** Calculates CRC-JAM (Polynomial 0xEDB88320, No final XOR). Result: [L, ML, MH, H] */
const crcjam = (data) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return new Uint8Array([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff]);
};
exports.crcjam = crcjam;
// Final Isomorphic Default Export
exports.default = {
    crc16Modbus: exports.crc16Modbus,
    crc16CcittFalse: exports.crc16CcittFalse,
    crc32: exports.crc32,
    crc8: exports.crc8,
    crc1: exports.crc1,
    crc8_1wire: exports.crc8_1wire,
    crc8_dvbs2: exports.crc8_dvbs2,
    crc16_kermit: exports.crc16_kermit,
    crc16_xmodem: exports.crc16_xmodem,
    crc24: exports.crc24,
    crc32mpeg: exports.crc32mpeg,
    crcjam: exports.crcjam,
};
//# sourceMappingURL=crc.js.map