// src/packet-builder.ts

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

import { crc16Modbus } from './utils/crc.js';
import { isUint8Array, concatUint8Arrays, toHex, sliceUint8Array } from './utils/utils.js';

/**
 * Формирует ADU-пакет Modbus RTU
 * @param slaveAddress - адрес устройства (1–255)
 * @param pdu - PDU без slaveAddress и CRC
 * @param crcFn - функция CRC (default: crc16Modbus)
 * @returns полный ADU с CRC
 */
function buildPacket(
  slaveAddress: number,
  pdu: Uint8Array,
  crcFn: (data: Uint8Array) => Uint8Array = crc16Modbus
): Uint8Array {
  if (!isUint8Array(pdu)) {
    throw new Error('PDU must be a Uint8Array');
  }

  const aduWithoutCrc: Uint8Array = concatUint8Arrays([new Uint8Array([slaveAddress]), pdu]);
  const crc: Uint8Array = crcFn(aduWithoutCrc); // возвращает Uint8Array из 2 байт
  return concatUint8Arrays([aduWithoutCrc, crc]);
}

/**
 * Разбирает ADU-пакет и проверяет CRC
 * @param packet - полный пакет
 * @param crcFn - функция CRC (default: crc16Modbus)
 * @returns { slaveAddress, pdu }
 */
function parsePacket(
  packet: Uint8Array,
  crcFn: (data: Uint8Array) => Uint8Array = crc16Modbus
): { slaveAddress: number; pdu: Uint8Array } {
  if (!isUint8Array(packet) || packet.length < 4) {
    throw new Error('Invalid packet: too short');
  }

  const receivedCrc: Uint8Array = sliceUint8Array(packet, -2);
  const aduWithoutCrc: Uint8Array = sliceUint8Array(packet, 0, -2);
  const calculatedCrc: Uint8Array = crcFn(aduWithoutCrc);

  if (!arraysEqual(receivedCrc, calculatedCrc)) {
    throw new Error(
      `CRC mismatch: received ${toHex(receivedCrc)}, calculated ${toHex(calculatedCrc)}`
    );
  }

  const slaveAddress: number = packet[0]!; // !: safe, length >= 4
  const pdu: Uint8Array = sliceUint8Array(packet, 1, -2);
  return { slaveAddress, pdu };
}

/**
 * Сравнивает два Uint8Array
 * @param a - первый массив
 * @param b - второй массив
 * @returns true if arrays equal
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i: number = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export { buildPacket, parsePacket };
