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
var crc_exports = {};
__export(crc_exports, {
  crc1: () => crc1,
  crc16CcittFalse: () => crc16CcittFalse,
  crc16Modbus: () => crc16Modbus,
  crc16_kermit: () => crc16_kermit,
  crc16_xmodem: () => crc16_xmodem,
  crc24: () => crc24,
  crc32: () => crc32,
  crc32mpeg: () => crc32mpeg,
  crc8: () => crc8,
  crc8_1wire: () => crc8_1wire,
  crc8_dvbs2: () => crc8_dvbs2,
  crcjam: () => crcjam
});
module.exports = __toCommonJS(crc_exports);
const CRC16_TABLE = new Uint16Array(256);
(function initCrc16Table() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? crc >> 1 ^ 40961 : crc >> 1;
    }
    CRC16_TABLE[i] = crc;
  }
})();
function crc16Modbus(buffer) {
  let crc = 65535;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    const index = (crc ^ byte) & 255;
    crc = crc >> 8 ^ CRC16_TABLE[index];
  }
  return new Uint8Array([crc & 255, crc >> 8 & 255]);
}
function crc16CcittFalse(buffer) {
  let crc = 65535;
  for (let pos = 0; pos < buffer.length; pos++) {
    crc ^= buffer[pos] << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 32768) !== 0) {
        crc = crc << 1 ^ 4129;
      } else {
        crc <<= 1;
      }
      crc &= 65535;
    }
  }
  return new Uint8Array([crc >> 8 & 255, crc & 255]);
}
function crc32(buffer) {
  let crc = 4294967295;
  for (let pos = 0; pos < buffer.length; pos++) {
    crc ^= buffer[pos];
    for (let i = 0; i < 8; i++) {
      if ((crc & 1) !== 0) {
        crc = crc >>> 1 ^ 3988292384;
      } else {
        crc >>>= 1;
      }
    }
  }
  crc ^= 4294967295;
  return new Uint8Array([crc & 255, crc >>> 8 & 255, crc >>> 16 & 255, crc >>> 24 & 255]);
}
function crc8(buffer) {
  let crc = 0;
  for (let pos = 0; pos < buffer.length; pos++) {
    crc ^= buffer[pos];
    for (let i = 0; i < 8; i++) {
      if ((crc & 128) !== 0) {
        crc = crc << 1 ^ 7;
      } else {
        crc <<= 1;
      }
      crc &= 255;
    }
  }
  return new Uint8Array([crc]);
}
function crc1(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    for (let i = 0; i < 8; i++) {
      crc ^= byte >> 7 - i & 1;
    }
  }
  return new Uint8Array([crc & 1]);
}
function crc8_1wire(buffer) {
  let crc = 0;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = crc >> 1 ^ 140;
      } else {
        crc >>= 1;
      }
    }
  }
  return new Uint8Array([crc]);
}
function crc8_dvbs2(buffer) {
  let crc = 0;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 128 ? crc << 1 ^ 213 : crc << 1;
      crc &= 255;
    }
  }
  return new Uint8Array([crc]);
}
function crc16_kermit(buffer) {
  let crc = 0;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = crc >> 1 ^ 33800;
      } else {
        crc >>= 1;
      }
    }
  }
  return new Uint8Array([crc & 255, crc >> 8 & 255]);
}
function crc16_xmodem(buffer) {
  let crc = 0;
  for (const b of buffer) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 32768 ? crc << 1 ^ 4129 : crc << 1;
      crc &= 65535;
    }
  }
  return new Uint8Array([crc >> 8 & 255, crc & 255]);
}
function crc24(buffer) {
  let crc = 11994318;
  for (const b of buffer) {
    crc ^= b << 16;
    for (let i = 0; i < 8; i++) {
      crc = crc & 8388608 ? crc << 1 ^ 8801531 : crc << 1;
      crc &= 16777215;
    }
  }
  return new Uint8Array([crc >> 16 & 255, crc >> 8 & 255, crc & 255]);
}
function crc32mpeg(buffer) {
  let crc = 4294967295;
  for (const b of buffer) {
    crc ^= b << 24;
    for (let i = 0; i < 8; i++) {
      crc = crc & 2147483648 ? crc << 1 ^ 79764919 : crc << 1;
      crc >>>= 0;
    }
  }
  return new Uint8Array([crc >>> 24 & 255, crc >>> 16 & 255, crc >>> 8 & 255, crc & 255]);
}
function crcjam(buffer) {
  let crc = 4294967295;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if ((crc & 1) !== 0) {
        crc = crc >>> 1 ^ 3988292384;
      } else {
        crc >>>= 1;
      }
    }
  }
  return new Uint8Array([crc & 255, crc >>> 8 & 255, crc >>> 16 & 255, crc >>> 24 & 255]);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  crc1,
  crc16CcittFalse,
  crc16Modbus,
  crc16_kermit,
  crc16_xmodem,
  crc24,
  crc32,
  crc32mpeg,
  crc8,
  crc8_1wire,
  crc8_dvbs2,
  crcjam
});
