"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var utils_exports = {};
__export(utils_exports, {
  allocUint8Array: () => allocUint8Array,
  bytesToUint16BE: () => bytesToUint16BE,
  concatUint8Arrays: () => concatUint8Arrays,
  fromBytes: () => fromBytes,
  fromBytesLE: () => fromBytesLE,
  isUint8Array: () => isUint8Array,
  sliceUint8Array: () => sliceUint8Array,
  toBytesLE: () => toBytesLE,
  toHex: () => toHex,
  uint16ToBytesBE: () => uint16ToBytesBE
});
module.exports = __toCommonJS(utils_exports);
const HEX_TABLE = "0123456789abcdef";
function fromBytes(...bytes) {
  return Uint8Array.from(bytes);
}
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
function uint16ToBytesBE(value) {
  const buf = new Uint8Array(2);
  buf[0] = value >> 8 & 255;
  buf[1] = value & 255;
  return buf;
}
function bytesToUint16BE(buf, offset = 0) {
  return buf[offset] << 8 | buf[offset + 1];
}
function sliceUint8Array(arr, start, end) {
  return arr.subarray(start, end);
}
function isUint8Array(obj) {
  return obj instanceof Uint8Array;
}
function allocUint8Array(size, fill = 0) {
  const arr = new Uint8Array(size);
  if (fill !== 0) {
    arr.fill(fill);
  }
  return arr;
}
function toHex(uint8arr) {
  let hex = "";
  for (let i = 0; i < uint8arr.length; i++) {
    const b = uint8arr[i];
    hex += HEX_TABLE[b >> 4 & 15] + HEX_TABLE[b & 15];
  }
  return hex;
}
function toBytesLE(value, byteLength = 2) {
  const arr = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    arr[i] = value >> 8 * i & 255;
  }
  return arr;
}
function fromBytesLE(lo, hi) {
  return hi << 8 | lo;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  allocUint8Array,
  bytesToUint16BE,
  concatUint8Arrays,
  fromBytes,
  fromBytesLE,
  isUint8Array,
  sliceUint8Array,
  toBytesLE,
  toHex,
  uint16ToBytesBE
});
