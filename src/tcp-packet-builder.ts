// src/tcp-packet-builder.ts

import { buildMbapHeader, parseMbapHeader } from './utils/tcp-utils.js';
import { concatUint8Arrays, sliceUint8Array } from './utils/utils.js';

/**
 * Собирает полный Modbus TCP пакет
 */
export function buildTcpPacket(transactionId: number, unitId: number, pdu: Uint8Array): Uint8Array {
  const header = buildMbapHeader(transactionId, unitId, pdu.length);
  return concatUint8Arrays([header, pdu]);
}

/**
 * Разбирает Modbus TCP пакет и валидирует заголовок
 */
export function parseTcpPacket(packet: Uint8Array, expectedTid?: number) {
  if (packet.length < 7) {
    throw new Error('Invalid TCP packet: too short');
  }

  const header = parseMbapHeader(packet);

  if (expectedTid !== undefined && header.transactionId !== expectedTid) {
    throw new Error(
      `Transaction ID mismatch: expected ${expectedTid}, got ${header.transactionId}`
    );
  }

  const pdu = sliceUint8Array(packet, 7);
  return { header, pdu };
}
