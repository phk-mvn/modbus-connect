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
var packet_builder_exports = {};
__export(packet_builder_exports, {
  buildPacket: () => buildPacket,
  parsePacket: () => parsePacket
});
module.exports = __toCommonJS(packet_builder_exports);
var import_crc = require("./utils/crc.js");
var import_utils = require("./utils/utils.js");
function buildPacket(slaveAddress, pdu, crcFn = import_crc.crc16Modbus) {
  if (!(0, import_utils.isUint8Array)(pdu)) {
    throw new Error("PDU must be a Uint8Array");
  }
  const aduWithoutCrc = (0, import_utils.concatUint8Arrays)([new Uint8Array([slaveAddress]), pdu]);
  const crc = crcFn(aduWithoutCrc);
  return (0, import_utils.concatUint8Arrays)([aduWithoutCrc, crc]);
}
function parsePacket(packet, crcFn = import_crc.crc16Modbus) {
  if (!(0, import_utils.isUint8Array)(packet) || packet.length < 4) {
    throw new Error("Invalid packet: too short");
  }
  const receivedCrc = (0, import_utils.sliceUint8Array)(packet, -2);
  const aduWithoutCrc = (0, import_utils.sliceUint8Array)(packet, 0, -2);
  const calculatedCrc = crcFn(aduWithoutCrc);
  if (!arraysEqual(receivedCrc, calculatedCrc)) {
    throw new Error(
      `CRC mismatch: received ${(0, import_utils.toHex)(receivedCrc)}, calculated ${(0, import_utils.toHex)(calculatedCrc)}`
    );
  }
  const slaveAddress = packet[0];
  const pdu = (0, import_utils.sliceUint8Array)(packet, 1, -2);
  return { slaveAddress, pdu };
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildPacket,
  parsePacket
});
