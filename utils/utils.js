// utils/utils.js

// Создание Uint8Array из чисел
function fromBytes(...bytes) {
    return Uint8Array.from(bytes);
}

/**
 * Concatenates an array of Uint8Arrays into a single Uint8Array.
 * @param {Uint8Array[]} arrays - An array of Uint8Arrays to concatenate.
 * @returns {Uint8Array} A new Uint8Array containing all elements from the input arrays.
 */
function concatUint8Arrays(arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/**
 * Converts a 16-bit unsigned integer to a Uint8Array in Big Endian format.
 * @param {number} value - The 16-bit unsigned integer to convert.
 * @returns {Uint8Array} A new Uint8Array containing the Big Endian representation of the input value.
 */
function uint16ToBytesBE(value) {
    const buf = new Uint8Array(2);
    buf[0] = (value >> 8) & 0xff;
    buf[1] = value & 0xff;
    return buf;
}

/**
 * Converts a Uint8Array in Big Endian format to a 16-bit unsigned integer.
 * @param {Uint8Array} buf - The Uint8Array to convert.
 * @param {number} offset - The offset within the Uint8Array to start reading from.
 * @returns {number} The 16-bit unsigned integer value.
 */
function bytesToUint16BE(buf, offset = 0) {
    return (buf[offset] << 8) | buf[offset + 1];
}

/**
 * Returns a new Uint8Array containing a slice of the input array.
 * @param {Uint8Array} arr - The input Uint8Array to slice.
 * @param {number} start - The starting index of the slice.
 * @param {number} end - The ending index of the slice.
 * @returns {Uint8Array} A new Uint8Array containing the sliced elements.
 */
function sliceUint8Array(arr, start, end) {
    return arr.subarray(start, end); // .slice() в Uint8Array создаёт копию
}

/**
 * Checks if the input object is a Uint8Array.
 * @param {any} obj - The object to check.
 * @returns {boolean} True if the object is a Uint8Array, false otherwise.
 */
function isUint8Array(obj) {
    return obj instanceof Uint8Array;
}

/**
 * Creates a new Uint8Array of the specified size and fills it with the specified value.
 * @param {number} size - The size of the new Uint8Array.
 * @param {number} fill - The value to fill the new Uint8Array with.
 * @returns {Uint8Array} A new Uint8Array of the specified size and filled with the specified value.
 */
function allocUint8Array(size, fill = 0) {
    const arr = new Uint8Array(size);
    if (fill !== 0) arr.fill(fill);
    return arr;
}

/**
 * Converts a Uint8Array to a hex string.
 * @param {Uint8Array} uint8arr - The Uint8Array to convert.
 * @returns {string} A hex string representation of the input Uint8Array.
 */
function toHex(uint8arr) {
    if (!isUint8Array(uint8arr)) {
        throw new Error('Argument must be a Uint8Array');
    }
    return Array.from(uint8arr)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Converts a number to a Uint8Array in Little Endian format.
 * @param {number} value - The number to convert.
 * @param {number} byteLength - The length of the output Uint8Array.
 * @returns {Uint8Array} A new Uint8Array containing the Little Endian representation of the input value.
 */
function toBytesLE(value, byteLength = 2) {
    const arr = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
        arr[i] = (value >> (8 * i)) & 0xFF;
    }
    return arr;
}

/**
 * Converts a Little Endian byte pair to a number.
 * @param {number} lo - The low byte.
 * @param {number} hi - The high byte.
 * @returns {number} The number represented by the Little Endian byte pair.
 */
function fromBytesLE(lo, hi) {
    return (hi << 8) | lo;
}

module.exports = {
    fromBytes,
    concatUint8Arrays,
    uint16ToBytesBE,
    bytesToUint16BE,
    sliceUint8Array,
    isUint8Array,
    allocUint8Array,
    toHex,
    toBytesLE,
    fromBytesLE
}