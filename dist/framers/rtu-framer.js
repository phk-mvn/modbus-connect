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
var rtu_framer_exports = {};
__export(rtu_framer_exports, {
  RtuFramer: () => RtuFramer
});
module.exports = __toCommonJS(rtu_framer_exports);
var import_crc = require("../utils/crc.js");
var import_utils = require("../utils/utils.js");
var import_errors = require("../errors.js");
class RtuFramer {
  constructor(crcFn = import_crc.crc16Modbus) {
    this.crcFn = crcFn;
  }
  buildAdu(slaveId, pdu) {
    const aduWithoutCrc = (0, import_utils.concatUint8Arrays)([new Uint8Array([slaveId]), pdu]);
    const crc = this.crcFn(aduWithoutCrc);
    return (0, import_utils.concatUint8Arrays)([aduWithoutCrc, crc]);
  }
  parseAdu(packet) {
    if (packet.length < 4) {
      throw new import_errors.ModbusResponseError("Invalid RTU packet: too short");
    }
    const receivedCrc = (0, import_utils.sliceUint8Array)(packet, -2);
    const aduWithoutCrc = (0, import_utils.sliceUint8Array)(packet, 0, -2);
    const calculatedCrc = this.crcFn(aduWithoutCrc);
    if (receivedCrc[0] !== calculatedCrc[0] || receivedCrc[1] !== calculatedCrc[1]) {
      throw new import_errors.ModbusCRCError(
        `CRC mismatch: received ${(0, import_utils.toHex)(receivedCrc)}, calculated ${(0, import_utils.toHex)(calculatedCrc)}`
      );
    }
    return {
      unitId: packet[0],
      pdu: (0, import_utils.sliceUint8Array)(packet, 1, -2)
    };
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
      // === ДОБАВЛЕНО ДЛЯ ТВОЕГО ПЛАГИНА ===
      case 85:
        expectedPduLen = 5;
        break;
      case 87:
        expectedPduLen = 1;
        break;
      case 90:
        return null;
      // ===================================
      default:
        return null;
    }
    return expectedPduLen + 3;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RtuFramer
});
