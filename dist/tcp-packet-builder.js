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
var tcp_packet_builder_exports = {};
__export(tcp_packet_builder_exports, {
  buildTcpPacket: () => buildTcpPacket,
  parseTcpPacket: () => parseTcpPacket
});
module.exports = __toCommonJS(tcp_packet_builder_exports);
var import_tcp_utils = require("./utils/tcp-utils.js");
var import_utils = require("./utils/utils.js");
function buildTcpPacket(transactionId, unitId, pdu) {
  const header = (0, import_tcp_utils.buildMbapHeader)(transactionId, unitId, pdu.length);
  return (0, import_utils.concatUint8Arrays)([header, pdu]);
}
function parseTcpPacket(packet, expectedTid) {
  if (packet.length < 7) {
    throw new Error("Invalid TCP packet: too short");
  }
  const header = (0, import_tcp_utils.parseMbapHeader)(packet);
  if (expectedTid !== void 0 && header.transactionId !== expectedTid) {
    throw new Error(
      `Transaction ID mismatch: expected ${expectedTid}, got ${header.transactionId}`
    );
  }
  const pdu = (0, import_utils.sliceUint8Array)(packet, 7);
  return { header, pdu };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildTcpPacket,
  parseTcpPacket
});
