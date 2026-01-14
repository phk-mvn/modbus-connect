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
var modbus_protocol_exports = {};
__export(modbus_protocol_exports, {
  ModbusProtocol: () => ModbusProtocol
});
module.exports = __toCommonJS(modbus_protocol_exports);
var import_tcp_framer = require("./tcp-framer.js");
var import_errors = require("../errors.js");
var import_utils = require("../utils/utils.js");
class ModbusProtocol {
  constructor(_transport, _framer) {
    this._transport = _transport;
    this._framer = _framer;
  }
  async exchange(unitId, pduRequest, timeout) {
    const startTime = Date.now();
    const aduRequest = this._framer.buildAdu(unitId, pduRequest);
    const expectedLen = this._framer.getExpectedResponseLength(pduRequest);
    if (this._transport.flush) {
      await this._transport.flush();
    }
    await this._transport.write(aduRequest);
    let buffer = new Uint8Array(0);
    const minLen = this._framer instanceof import_tcp_framer.TcpFramer ? 7 : 4;
    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new import_errors.ModbusTimeoutError(`Response timeout after ${elapsed}ms`);
      }
      const bytesToRead = expectedLen ? Math.max(1, expectedLen - buffer.length) : 1;
      const chunk = await this._transport.read(bytesToRead, timeout - elapsed);
      if (chunk && chunk.length > 0) {
        const combined = (0, import_utils.concatUint8Arrays)([buffer, chunk]);
        buffer = combined;
      }
      if (buffer.length >= minLen) {
        try {
          const context = this._framer instanceof import_tcp_framer.TcpFramer ? { transactionId: this._framer.currentTransactionId } : {};
          const { pdu: responsePdu } = this._framer.parseAdu(buffer, context);
          return responsePdu;
        } catch (err) {
          const isShort = err instanceof import_errors.ModbusResponseError && err.message.includes("short");
          const isCrc = err instanceof import_errors.ModbusCRCError;
          if (isCrc || isShort) {
            if (expectedLen && buffer.length >= expectedLen) {
              throw err;
            }
            continue;
          }
          throw err;
        }
      }
    }
  }
  get transport() {
    return this._transport;
  }
  get framer() {
    return this._framer;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ModbusProtocol
});
