"use strict";
// modbus/utils/utils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromBytesLE = exports.toBytesLE = exports.allocUint8Array = exports.isUint8Array = exports.sliceUint8Array = exports.bytesToUint16BE = exports.uint16ToBytesBE = exports.toHex = exports.concatUint8Arrays = exports.fromBytes = void 0;
const HEX_TABLE = '0123456789abcdef';
/**
 * Creates a Uint8Array from a variable list of byte numbers.
 */
const fromBytes = (...bytes) => {
    return new Uint8Array(bytes);
};
exports.fromBytes = fromBytes;
/**
 * Concatenates multiple Uint8Arrays into a single new Uint8Array.
 */
const concatUint8Arrays = (arrays) => {
    let totalLength = 0;
    for (let i = 0; i < arrays.length; i++) {
        totalLength += arrays[i].length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < arrays.length; i++) {
        const arr = arrays[i];
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
};
exports.concatUint8Arrays = concatUint8Arrays;
/**
 * Converts a Uint8Array to a lowercase hexadecimal string.
 */
const toHex = (buffer) => {
    let hex = '';
    for (let i = 0; i < buffer.length; i++) {
        const b = buffer[i];
        hex += HEX_TABLE[(b >> 4) & 0x0f];
        hex += HEX_TABLE[b & 0x0f];
    }
    return hex;
};
exports.toHex = toHex;
/**
 * Converts a 16-bit unsigned integer to a 2-byte Uint8Array in Big-Endian format.
 */
const uint16ToBytesBE = (val) => {
    const buf = new Uint8Array(2);
    buf[0] = (val >> 8) & 0xff;
    buf[1] = val & 0xff;
    return buf;
};
exports.uint16ToBytesBE = uint16ToBytesBE;
/**
 * Reads a 16-bit unsigned integer from a buffer at a specific offset in Big-Endian format.
 */
const bytesToUint16BE = (buffer, offset = 0) => {
    if (offset + 1 >= buffer.length) {
        throw new Error('Offset out of bounds for 16-bit read');
    }
    return ((buffer[offset] << 8) | buffer[offset + 1]) >>> 0;
};
exports.bytesToUint16BE = bytesToUint16BE;
/**
 * Creates a copy of a segment of a Uint8Array.
 */
const sliceUint8Array = (arr, start, end) => {
    return arr.slice(start, end);
};
exports.sliceUint8Array = sliceUint8Array;
/**
 * Checks if the provided object is a Uint8Array.
 */
const isUint8Array = (obj) => {
    return obj instanceof Uint8Array;
};
exports.isUint8Array = isUint8Array;
/**
 * Allocates a new Uint8Array of the specified size and optionally fills it.
 */
const allocUint8Array = (size, fill = 0) => {
    const arr = new Uint8Array(size);
    if (fill !== 0)
        arr.fill(fill);
    return arr;
};
exports.allocUint8Array = allocUint8Array;
/**
 * Converts a number to a Uint8Array in Little-Endian format.
 */
const toBytesLE = (val, byteLen = 2) => {
    const buf = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) {
        buf[i] = (val >>> (8 * i)) & 0xff;
    }
    return buf;
};
exports.toBytesLE = toBytesLE;
/**
 * Combines two bytes into a 16-bit unsigned integer in Little-Endian format.
 */
const fromBytesLE = (lo, hi) => {
    return ((hi << 8) | lo) >>> 0;
};
exports.fromBytesLE = fromBytesLE;
// Для совместимости с Vite (исправляет ошибку "does not provide an export named default")
exports.default = {
    fromBytes: exports.fromBytes,
    concatUint8Arrays: exports.concatUint8Arrays,
    toHex: exports.toHex,
    uint16ToBytesBE: exports.uint16ToBytesBE,
    bytesToUint16BE: exports.bytesToUint16BE,
    sliceUint8Array: exports.sliceUint8Array,
    isUint8Array: exports.isUint8Array,
    allocUint8Array: exports.allocUint8Array,
    toBytesLE: exports.toBytesLE,
    fromBytesLE: exports.fromBytesLE,
};
//# sourceMappingURL=utils.js.map