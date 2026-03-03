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
var tcp_framer_exports = {};
__export(tcp_framer_exports, {
  TcpFramer: () => TcpFramer
});
module.exports = __toCommonJS(tcp_framer_exports);
var import_utils = require("../utils/utils.js");
var import_errors = require("../errors.js");
class TcpFramer {
  _transactionId = 0;
  /**
   * Генерирует следующий Transaction ID (0-65535)
   */
  _getNextTransactionId() {
    this._transactionId = (this._transactionId + 1) % 65536;
    return this._transactionId;
  }
  buildAdu(unitId, pdu) {
    const tid = this._getNextTransactionId();
    const mbap = new Uint8Array(7);
    const view = new DataView(mbap.buffer);
    view.setUint16(0, tid, false);
    view.setUint16(2, 0, false);
    view.setUint16(4, pdu.length + 1, false);
    view.setUint8(6, unitId);
    return (0, import_utils.concatUint8Arrays)([mbap, pdu]);
  }
  parseAdu(packet, context) {
    if (packet.length < 7) {
      throw new import_errors.ModbusResponseError("Invalid TCP packet: too short for MBAP");
    }
    const view = new DataView(packet.buffer, packet.byteOffset, 7);
    const receivedTid = view.getUint16(0, false);
    const protocolId = view.getUint16(2, false);
    const unitId = view.getUint8(6);
    if (protocolId !== 0) {
      throw new import_errors.ModbusResponseError(`Invalid Protocol ID: ${protocolId}`);
    }
    if (context?.transactionId !== void 0 && receivedTid !== context.transactionId) {
      throw new import_errors.ModbusInvalidTransactionIdError(receivedTid, context.transactionId);
    }
    return {
      unitId,
      pdu: (0, import_utils.sliceUint8Array)(packet, 7)
    };
  }
  /**
   * Возвращает текущий ID транзакции (нужен для контекста при разборе)
   */
  get currentTransactionId() {
    return this._transactionId;
  }
  getExpectedResponseLength(pdu) {
    const funcCode = pdu[0];
    let expectedPduLen = null;
    switch (funcCode) {
      case 1:
      case 2:
        const bitCount = pdu[3] << 8 | pdu[4];
        expectedPduLen = 2 + Math.ceil(bitCount / 8);
        break;
      case 3:
      case 4:
        const regCount = pdu[3] << 8 | pdu[4];
        expectedPduLen = 2 + regCount * 2;
        break;
      case 5:
      case 6:
      case 15:
      case 16:
        expectedPduLen = 5;
        break;
      default:
        return null;
    }
    return expectedPduLen + 7;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TcpFramer
});
