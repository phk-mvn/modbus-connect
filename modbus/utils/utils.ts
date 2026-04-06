// modbus/utils/utils.ts

const HEX_TABLE = '0123456789abcdef';

/**
 * Creates a Uint8Array from a variable list of byte numbers.
 */
export const fromBytes = (...bytes: number[]): Uint8Array => {
  return new Uint8Array(bytes);
};

/**
 * Concatenates multiple Uint8Arrays into a single new Uint8Array.
 */
export const concatUint8Arrays = (arrays: Uint8Array[]): Uint8Array => {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += arrays[i]!.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i]!;
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

/**
 * Converts a Uint8Array to a lowercase hexadecimal string.
 */
export const toHex = (buffer: Uint8Array): string => {
  let hex = '';
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i]!;
    hex += HEX_TABLE[(b >> 4) & 0x0f];
    hex += HEX_TABLE[b & 0x0f];
  }
  return hex;
};

/**
 * Converts a 16-bit unsigned integer to a 2-byte Uint8Array in Big-Endian format.
 */
export const uint16ToBytesBE = (val: number): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = (val >> 8) & 0xff;
  buf[1] = val & 0xff;
  return buf;
};

/**
 * Reads a 16-bit unsigned integer from a buffer at a specific offset in Big-Endian format.
 */
export const bytesToUint16BE = (buffer: Uint8Array, offset: number = 0): number => {
  if (offset + 1 >= buffer.length) {
    throw new Error('Offset out of bounds for 16-bit read');
  }
  return ((buffer[offset]! << 8) | buffer[offset + 1]!) >>> 0;
};

/**
 * Creates a copy of a segment of a Uint8Array.
 */
export const sliceUint8Array = (arr: Uint8Array, start: number, end?: number): Uint8Array => {
  return arr.slice(start, end);
};

/**
 * Checks if the provided object is a Uint8Array.
 */
export const isUint8Array = (obj: any): obj is Uint8Array => {
  return obj instanceof Uint8Array;
};

/**
 * Allocates a new Uint8Array of the specified size and optionally fills it.
 */
export const allocUint8Array = (size: number, fill: number = 0): Uint8Array => {
  const arr = new Uint8Array(size);
  if (fill !== 0) arr.fill(fill);
  return arr;
};

/**
 * Converts a number to a Uint8Array in Little-Endian format.
 */
export const toBytesLE = (val: number, byteLen: number = 2): Uint8Array => {
  const buf = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    buf[i] = (val >>> (8 * i)) & 0xff;
  }
  return buf;
};

/**
 * Combines two bytes into a 16-bit unsigned integer in Little-Endian format.
 */
export const fromBytesLE = (lo: number, hi: number): number => {
  return ((hi << 8) | lo) >>> 0;
};

// Для совместимости с Vite (исправляет ошибку "does not provide an export named default")
export default {
  fromBytes,
  concatUint8Arrays,
  toHex,
  uint16ToBytesBE,
  bytesToUint16BE,
  sliceUint8Array,
  isUint8Array,
  allocUint8Array,
  toBytesLE,
  fromBytesLE,
};
