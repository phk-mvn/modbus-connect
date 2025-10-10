// src/utils/utils.ts

const HEX_TABLE = '0123456789abcdef';

/**
 * Создание Uint8Array из чисел
 * @param bytes - переменное число байтов
 * @returns Uint8Array из байтов
 */
export function fromBytes(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

/**
 * Concatenates an array of Uint8Arrays into a single Uint8Array.
 * @param arrays - An array of Uint8Arrays to concatenate.
 * @returns A new Uint8Array containing all elements from the input arrays.
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength: number = arrays.reduce((sum: number, arr: Uint8Array) => sum + arr.length, 0);
  const result: Uint8Array = new Uint8Array(totalLength);
  let offset: number = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Converts a 16-bit unsigned integer to a Uint8Array in Big Endian format.
 * @param value - The 16-bit unsigned integer to convert.
 * @returns A new Uint8Array containing the Big Endian representation of the input value.
 */
export function uint16ToBytesBE(value: number): Uint8Array {
  const buf: Uint8Array = new Uint8Array(2);
  buf[0] = (value >> 8) & 0xff;
  buf[1] = value & 0xff;
  return buf;
}

/**
 * Converts a Uint8Array in Big Endian format to a 16-bit unsigned integer.
 * @param buf - The Uint8Array to convert.
 * @param offset - The offset within the Uint8Array to start reading from.
 * @returns The 16-bit unsigned integer value.
 */
export function bytesToUint16BE(buf: Uint8Array, offset: number = 0): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

/**
 * Returns a new Uint8Array containing a slice of the input array.
 * @param arr - The input Uint8Array to slice.
 * @param start - The starting index of the slice.
 * @param end - The ending index of the slice.
 * @returns A new Uint8Array containing the sliced elements.
 */
export function sliceUint8Array(arr: Uint8Array, start: number, end?: number): Uint8Array {
  return arr.subarray(start, end); // subarray is efficient (shared buffer), handles undefined end safely
}

/**
 * Checks if the input object is a Uint8Array.
 * @param obj - The object to check.
 * @returns True if the object is a Uint8Array, false otherwise.
 */
export function isUint8Array(obj: unknown): obj is Uint8Array {
  return obj instanceof Uint8Array;
}

/**
 * Creates a new Uint8Array of the specified size and fills it with the specified value.
 * @param size - The size of the new Uint8Array.
 * @param fill - The value to fill the new Uint8Array with.
 * @returns A new Uint8Array of the specified size and filled with the specified value.
 */
export function allocUint8Array(size: number, fill: number = 0): Uint8Array {
  const arr: Uint8Array = new Uint8Array(size); // Defaults to zeros
  if (fill !== 0) {
    arr.fill(fill);
  }
  return arr;
}

/**
 * Converts a Uint8Array to a hex string (optimized with lookup table).
 * @param uint8arr - The Uint8Array to convert.
 * @returns A hex string representation of the input Uint8Array.
 */
export function toHex(uint8arr: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < uint8arr.length; i++) {
    const b = uint8arr[i]!;
    hex += HEX_TABLE[(b >> 4) & 0xf]! + HEX_TABLE[b & 0xf]!;
  }
  return hex;
}

/**
 * Converts a number to a Uint8Array in Little Endian format.
 * @param value - The number to convert.
 * @param byteLength - The length of the output Uint8Array.
 * @returns A new Uint8Array containing the Little Endian representation of the input value.
 */
export function toBytesLE(value: number, byteLength: number = 2): Uint8Array {
  const arr: Uint8Array = new Uint8Array(byteLength);
  for (let i: number = 0; i < byteLength; i++) {
    arr[i] = (value >> (8 * i)) & 0xff;
  }
  return arr;
}

/**
 * Converts a Little Endian byte pair to a number.
 * @param lo - The low byte.
 * @param hi - The high byte.
 * @returns The number represented by the Little Endian byte pair.
 */
export function fromBytesLE(lo: number, hi: number): number {
  return (hi << 8) | lo;
}
