// modbus/utils/buffer.ts

/**
 * Utility functions for byte-level operations, buffer manipulations,
 * integer encoding/decoding, and hexadecimal conversion.
 */

const HEX_TABLE = '0123456789abcdef';

/**
 * Creates a new Uint8Array from a variable list of byte numbers.
 *
 * @param bytes - Sequence of byte values (0-255).
 * @returns A newly allocated Uint8Array initialized with the provided bytes.
 */
export const fromBytes = (...bytes: number[]): Uint8Array => {
  return new Uint8Array(bytes);
};

/**
 * Concatenates multiple Uint8Arrays into a single contiguous Uint8Array.
 *
 * @param arrays - Array of Uint8Array instances to concatenate.
 * @returns A single newly allocated Uint8Array containing all bytes in order.
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
 * Converts a Uint8Array to a lowercase hexadecimal string representation.
 *
 * @param buffer - The Uint8Array to convert.
 * @returns Hexadecimal string representation in lowercase.
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
 * Converts a 16-bit unsigned integer to a 2-byte Uint8Array in Big-Endian format (standard Modbus wire order).
 *
 * @param val - 16-bit unsigned integer (0-65535).
 * @returns A 2-byte Uint8Array containing `[highByte, lowByte]`.
 */
export const uint16ToBytesBE = (val: number): Uint8Array => {
  const buf = new Uint8Array(2);
  buf[0] = (val >> 8) & 0xff;
  buf[1] = val & 0xff;
  return buf;
};

/**
 * Reads a 16-bit unsigned integer from a buffer at a specific offset in Big-Endian format.
 *
 * @param buffer - Buffer to read from.
 * @param offset - Byte index to start reading from (default: 0).
 * @returns 16-bit unsigned integer value.
 * @throws {Error} If offset + 1 exceeds buffer bounds.
 */
export const bytesToUint16BE = (buffer: Uint8Array, offset: number = 0): number => {
  if (offset + 1 >= buffer.length) {
    throw new Error('Offset out of bounds for 16-bit read');
  }
  return ((buffer[offset]! << 8) | buffer[offset + 1]!) >>> 0;
};

/**
 * Creates a shallow copy of a segment of a Uint8Array.
 *
 * @param arr - Source Uint8Array.
 * @param start - Zero-based index at which to begin extraction.
 * @param end - Zero-based index before which to end extraction.
 * @returns A new Uint8Array containing the extracted elements.
 */
export const sliceUint8Array = (arr: Uint8Array, start: number, end?: number): Uint8Array => {
  return arr.slice(start, end);
};

/**
 * Type guard that checks if the provided value is an instance of Uint8Array.
 *
 * @param obj - Any object or value to test.
 * @returns True if obj is a Uint8Array, false otherwise.
 */
export const isUint8Array = (obj: any): obj is Uint8Array => {
  return obj instanceof Uint8Array;
};

/**
 * Allocates a new Uint8Array of the specified byte length and optionally fills it with a constant value.
 *
 * @param size - Number of bytes to allocate.
 * @param fill - Value to fill all bytes with (default: 0).
 * @returns Allocated Uint8Array.
 */
export const allocUint8Array = (size: number, fill: number = 0): Uint8Array => {
  const arr = new Uint8Array(size);
  if (fill !== 0) arr.fill(fill);
  return arr;
};

/**
 * Converts a number to a Uint8Array in Little-Endian byte order.
 *
 * @param val - Number to convert.
 * @param byteLen - Total number of bytes in output (default: 2).
 * @returns A new Uint8Array in Little-Endian format.
 */
export const toBytesLE = (val: number, byteLen: number = 2): Uint8Array => {
  const buf = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    buf[i] = (val >>> (8 * i)) & 0xff;
  }
  return buf;
};

/**
 * Combines two individual bytes into a 16-bit unsigned integer in Little-Endian format.
 *
 * @param lo - Low byte (0-255).
 * @param hi - High byte (0-255).
 * @returns 16-bit unsigned integer combined in Little-Endian order.
 */
export const fromBytesLE = (lo: number, hi: number): number => {
  return ((hi << 8) | lo) >>> 0;
};

// For compatibility with Vite (fixes the "does not provide an export named default" error)
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
