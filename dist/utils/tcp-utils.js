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
var tcp_utils_exports = {};
__export(tcp_utils_exports, {
  TransactionCounter: () => TransactionCounter,
  buildMbapHeader: () => buildMbapHeader,
  parseMbapHeader: () => parseMbapHeader
});
module.exports = __toCommonJS(tcp_utils_exports);
class TransactionCounter {
  _currentId = 0;
  next() {
    this._currentId = (this._currentId + 1) % 65536;
    return this._currentId;
  }
  get current() {
    return this._currentId;
  }
}
function buildMbapHeader(transactionId, unitId, pduLength) {
  const header = new Uint8Array(7);
  const view = new DataView(header.buffer);
  view.setUint16(0, transactionId, false);
  view.setUint16(2, 0, false);
  view.setUint16(4, pduLength + 1, false);
  view.setUint8(6, unitId);
  return header;
}
function parseMbapHeader(data) {
  if (data.length < 7) throw new Error("MBAP header too short");
  const view = new DataView(data.buffer, data.byteOffset, 7);
  return {
    transactionId: view.getUint16(0, false),
    protocolId: view.getUint16(2, false),
    length: view.getUint16(4, false),
    unitId: view.getUint8(6)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TransactionCounter,
  buildMbapHeader,
  parseMbapHeader
});
