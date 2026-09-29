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
export const isUint8Array = (obj: unknown): obj is Uint8Array => {
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

/**
 * Converts a 32-bit floating point number to two 16-bit Modbus registers.
 *
 * @param val - Floating point number.
 * @param wordOrder - 'BE' (high word first) or 'LE' (low word first). Default 'BE'.
 * @returns Tuple of two 16-bit integers [reg0, reg1].
 */
export const float32ToRegisters = (
  val: number,
  wordOrder: 'BE' | 'LE' = 'BE'
): [number, number] => {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, val, false);
  const u8 = new Uint8Array(buf);
  const w1 = (u8[0]! << 8) | u8[1]!;
  const w2 = (u8[2]! << 8) | u8[3]!;
  return wordOrder === 'LE' ? [w2, w1] : [w1, w2];
};

/**
 * Converts two 16-bit Modbus registers to a 32-bit floating point number.
 *
 * @param registers - Tuple of two 16-bit integers [reg0, reg1].
 * @param wordOrder - 'BE' (high word first) or 'LE' (low word first). Default 'BE'.
 * @returns 32-bit float value.
 */
export const registersToFloat32 = (
  registers: [number, number] | number[],
  wordOrder: 'BE' | 'LE' = 'BE'
): number => {
  const buf = new ArrayBuffer(4);
  const u8 = new Uint8Array(buf);
  const ordered =
    wordOrder === 'LE'
      ? [registers[1] ?? 0, registers[0] ?? 0]
      : [registers[0] ?? 0, registers[1] ?? 0];
  u8[0] = (ordered[0]! >> 8) & 0xff;
  u8[1] = ordered[0]! & 0xff;
  u8[2] = (ordered[1]! >> 8) & 0xff;
  u8[3] = ordered[1]! & 0xff;
  return new DataView(buf).getFloat32(0, false);
};

/**
 * Converts a 64-bit floating point number to four 16-bit Modbus registers.
 *
 * @param val - Double precision floating point number.
 * @param wordOrder - 'BE' or 'LE'. Default 'BE'.
 * @returns Tuple of four 16-bit integers.
 */
export const float64ToRegisters = (
  val: number,
  wordOrder: 'BE' | 'LE' = 'BE'
): [number, number, number, number] => {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, val, false);
  const u8 = new Uint8Array(buf);
  const w1 = (u8[0]! << 8) | u8[1]!;
  const w2 = (u8[2]! << 8) | u8[3]!;
  const w3 = (u8[4]! << 8) | u8[5]!;
  const w4 = (u8[6]! << 8) | u8[7]!;
  return wordOrder === 'LE' ? [w4, w3, w2, w1] : [w1, w2, w3, w4];
};

/**
 * Converts four 16-bit Modbus registers to a 64-bit floating point number.
 */
export const registersToFloat64 = (
  registers: [number, number, number, number] | number[],
  wordOrder: 'BE' | 'LE' = 'BE'
): number => {
  const buf = new ArrayBuffer(8);
  const u8 = new Uint8Array(buf);
  const ordered =
    wordOrder === 'LE'
      ? [registers[3] ?? 0, registers[2] ?? 0, registers[1] ?? 0, registers[0] ?? 0]
      : [registers[0] ?? 0, registers[1] ?? 0, registers[2] ?? 0, registers[3] ?? 0];
  for (let i = 0; i < 4; i++) {
    u8[i * 2] = (ordered[i]! >> 8) & 0xff;
    u8[i * 2 + 1] = ordered[i]! & 0xff;
  }
  return new DataView(buf).getFloat64(0, false);
};

/**
 * Converts a signed 32-bit integer to two 16-bit Modbus registers.
 */
export const int32ToRegisters = (val: number, wordOrder: 'BE' | 'LE' = 'BE'): [number, number] => {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setInt32(0, val, false);
  const u8 = new Uint8Array(buf);
  const w1 = (u8[0]! << 8) | u8[1]!;
  const w2 = (u8[2]! << 8) | u8[3]!;
  return wordOrder === 'LE' ? [w2, w1] : [w1, w2];
};

/**
 * Converts two 16-bit Modbus registers to a signed 32-bit integer.
 */
export const registersToInt32 = (
  registers: [number, number] | number[],
  wordOrder: 'BE' | 'LE' = 'BE'
): number => {
  const buf = new ArrayBuffer(4);
  const u8 = new Uint8Array(buf);
  const ordered =
    wordOrder === 'LE'
      ? [registers[1] ?? 0, registers[0] ?? 0]
      : [registers[0] ?? 0, registers[1] ?? 0];
  u8[0] = (ordered[0]! >> 8) & 0xff;
  u8[1] = ordered[0]! & 0xff;
  u8[2] = (ordered[1]! >> 8) & 0xff;
  u8[3] = ordered[1]! & 0xff;
  return new DataView(buf).getInt32(0, false);
};

/**
 * Converts an unsigned 32-bit integer to two 16-bit Modbus registers.
 */
export const uint32ToRegisters = (val: number, wordOrder: 'BE' | 'LE' = 'BE'): [number, number] => {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, val, false);
  const u8 = new Uint8Array(buf);
  const w1 = (u8[0]! << 8) | u8[1]!;
  const w2 = (u8[2]! << 8) | u8[3]!;
  return wordOrder === 'LE' ? [w2, w1] : [w1, w2];
};

/**
 * Converts two 16-bit Modbus registers to an unsigned 32-bit integer.
 */
export const registersToUInt32 = (
  registers: [number, number] | number[],
  wordOrder: 'BE' | 'LE' = 'BE'
): number => {
  const buf = new ArrayBuffer(4);
  const u8 = new Uint8Array(buf);
  const ordered =
    wordOrder === 'LE'
      ? [registers[1] ?? 0, registers[0] ?? 0]
      : [registers[0] ?? 0, registers[1] ?? 0];
  u8[0] = (ordered[0]! >> 8) & 0xff;
  u8[1] = ordered[0]! & 0xff;
  u8[2] = (ordered[1]! >> 8) & 0xff;
  u8[3] = ordered[1]! & 0xff;
  return new DataView(buf).getUint32(0, false);
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
  float32ToRegisters,
  registersToFloat32,
  float64ToRegisters,
  registersToFloat64,
  int32ToRegisters,
  registersToInt32,
  uint32ToRegisters,
  registersToUInt32,
};
