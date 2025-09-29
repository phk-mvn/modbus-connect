// packet-builder.js

//                    ,,,, 
//              ,;) .';;;;',
//  (;,,_,-.-.,;;'_,||\;;;/\,,_
//   `';;/:|:);{ ;;;|| \;/ |;;;\__
//       L;/-';/ \;;\',/;\/;;;.') \
//       .:`''` - \;;'.__/;;;/  . _'-._ 
//     .'/   \     \;;;;;;/.'_7:.  '). \_
//   .''/     \ '._ );}{;//.'    '-:  '.,L
// .'. /       \  ( |;;;/_/         \._./;\   _,
//  . /        |\ ( /;;/_/             ';;;\,;;_,
// . /         )__(/;;/_/                (;;'''''
//  /        _;:':;;;;:';-._             );
// /        /   \  `'`   --.'-._         \/
//        .'     '.  ,'         '-,
//       /    /   r--,..__       '.\
//     .'    '  .'        '--._     ]
//     (     :.(;>        _ .' '- ;/
//     |      /:;(    ,_.';(   __.'
//      '- -'"|;:/    (;;;;-'--'
//            |;/      ;;(
//            ''      /;;|
//                    \;;|
//                     \/

const crcFns = require('./utils/crc.js');
const {
  isUint8Array,
  concatUint8Arrays,
  toHex,
  sliceUint8Array
} = require('./utils/utils.js');

/**
 * Формирует ADU-пакет Modbus RTU
 * @param {number} slaveAddress - адрес устройства (0–247)
 * @param {Uint8Array} pdu - PDU без slaveAddress и CRC
 * @returns {Uint8Array} - полный ADU с CRC
 */
function buildPacket(slaveAddress, pdu, crcFn = crcFns.crc16Modbus) {
  if (!isUint8Array(pdu)) {
    throw new Error('PDU must be a Uint8Array');
  }

  const aduWithoutCrc = concatUint8Arrays([new Uint8Array([slaveAddress]), pdu]);
  const crc = crcFn(aduWithoutCrc); // возвращает Uint8Array из 2 байт
  return concatUint8Arrays([aduWithoutCrc, crc]);
}

/**
 * Разбирает ADU-пакет и проверяет CRC
 * @param {Uint8Array} packet - полный пакет
 * @returns {Object} - { slaveAddress, pdu }
 */
function parsePacket(packet, crcFn) {
  // Ранний выход при коротком пакете
  if (!isUint8Array(packet) || packet.length < 4) {   // Было packet.length < 4
    throw new Error('Invalid packet: too short');
  }

  if(typeof crcFn !== 'function'){
    crcFn = crcFns.crc16Modbus;
  }

  const receivedCrc = sliceUint8Array(packet, -2);
  const aduWithoutCrc = sliceUint8Array(packet, 0, -2);
  const calculatedCrc = crcFn(aduWithoutCrc);

  if (!arraysEqual(receivedCrc, calculatedCrc)) {
    throw new Error(`CRC mismatch: received ${toHex(receivedCrc)}, calculated ${toHex(calculatedCrc)}`);
  }

  const slaveAddress = packet[0];
  const pdu = sliceUint8Array(packet, 1, -2);
  return { slaveAddress, pdu };
}

/**
 * Сравнивает два Uint8Array
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

module.exports = {
  buildPacket,
  parsePacket
};