// modbus/schema/codec.ts

import type {
  TSchemaField,
  TSchemaTable,
  TSchemaWordOrder,
  TSchemaEntry,
  ISchemaGroupDefinition,
  IGroupSubFieldDefinition,
  INumericFieldDefinition,
  IBooleanFieldDefinition,
  IBitmaskFieldDefinition,
  IStringFieldDefinition,
} from './types.js';

/**
 * Checks whether a schema entry is a group definition.
 */
export function isSchemaGroup(entry: TSchemaEntry): entry is ISchemaGroupDefinition {
  return typeof entry === 'object' && entry !== null && 'group' in entry;
}

/**
 * Converts a group subfield definition into a synthetic TSchemaField for decoding/encoding.
 */
export function subFieldToField(
  subField: IGroupSubFieldDefinition,
  baseAddress: number,
  table: TSchemaTable = 'holding'
): TSchemaField {
  return {
    ...subField,
    address: baseAddress + subField.offset,
    table,
  } as TSchemaField;
}

/**
 * Calculates the total length in registers/bits required to cover all subfields in a group.
 */
export function getGroupLength(group: ISchemaGroupDefinition): number {
  const table = group.table ?? 'holding';
  const subFields = Object.values(group.group);
  if (subFields.length === 0) return 0;

  let maxSpan = 0;
  for (const sf of subFields) {
    const fieldLen = getFieldLength(subFieldToField(sf, group.address, table));
    const span = sf.offset + fieldLen;
    if (span > maxSpan) maxSpan = span;
  }
  return maxSpan;
}

/**
 * Returns the effective memory table for a field.
 * Defaults to 'coil' for booleans without a table, and 'holding' for other types.
 */
export function getFieldTable(field: TSchemaField): TSchemaTable {
  if (field.table) return field.table;
  return field.type === 'boolean' ? 'coil' : 'holding';
}

/**
 * Returns the number of 16-bit registers occupied by a field.
 * For coils/discrete inputs, this returns the bit length (1).
 */
export function getFieldLength(field: TSchemaField): number {
  switch (field.type) {
    case 'uint16':
    case 'int16':
    case 'bitmask':
      return 1;
    case 'uint32':
    case 'int32':
    case 'float32':
      return 2;
    case 'float64':
      return 4;
    case 'boolean':
      return 1;
    case 'string':
      return Math.max(1, Math.ceil((field.length || 2) / 2));
    default:
      return 1;
  }
}

/**
 * Decodes a field value from raw register or coil arrays.
 *
 * @param field - The schema field definition.
 * @param slice - Slice of registers (for register tables) or boolean bits (for coil/discrete tables).
 * @param defaultWordOrder - Default word order from the schema.
 * @returns Decoded value matching the field type.
 */
export function decodeFieldValue(
  field: TSchemaField,
  registers: number[],
  coils: boolean[],
  defaultWordOrder: TSchemaWordOrder = 'BE'
): unknown {
  const table = getFieldTable(field);
  const isBitTable = table === 'coil' || table === 'discrete';

  if (isBitTable) {
    return coils[0] ?? false;
  }

  // Register-based decoding
  switch (field.type) {
    case 'uint16': {
      const raw = registers[0] ?? 0;
      return raw & 0xffff;
    }

    case 'int16': {
      const raw = registers[0] ?? 0;
      return raw > 0x7fff ? raw - 0x10000 : raw;
    }

    case 'uint32': {
      const numField = field as INumericFieldDefinition;
      const wo = numField.wordOrder ?? defaultWordOrder;
      const view = buildDataView(registers.slice(0, 2), wo);
      return view.getUint32(0, false);
    }

    case 'int32': {
      const numField = field as INumericFieldDefinition;
      const wo = numField.wordOrder ?? defaultWordOrder;
      const view = buildDataView(registers.slice(0, 2), wo);
      return view.getInt32(0, false);
    }

    case 'float32': {
      const numField = field as INumericFieldDefinition;
      const wo = numField.wordOrder ?? defaultWordOrder;
      const view = buildDataView(registers.slice(0, 2), wo);
      return view.getFloat32(0, false);
    }

    case 'float64': {
      const numField = field as INumericFieldDefinition;
      const wo = numField.wordOrder ?? defaultWordOrder;
      const view = buildDataView(registers.slice(0, 4), wo);
      return view.getFloat64(0, false);
    }

    case 'boolean': {
      const boolField = field as IBooleanFieldDefinition;
      const raw = registers[0] ?? 0;
      if (boolField.bit !== undefined) {
        return ((raw >> boolField.bit) & 1) === 1;
      }
      return raw !== 0;
    }

    case 'bitmask': {
      const bitField = field as IBitmaskFieldDefinition;
      const raw = registers[0] ?? 0;
      const result: Record<string, boolean> = {};
      for (const [key, bitPos] of Object.entries(bitField.bits)) {
        result[key] = ((raw >> bitPos) & 1) === 1;
      }
      return result;
    }

    case 'string': {
      const strField = field as IStringFieldDefinition;
      const len = strField.length;
      let str = '';
      for (const reg of registers) {
        const c1 = (reg >> 8) & 0xff;
        const c2 = reg & 0xff;
        if (c1 === 0 || str.length >= len) break;
        str += String.fromCharCode(c1);
        if (c2 === 0 || str.length >= len) break;
        str += String.fromCharCode(c2);
      }
      return str.trim();
    }

    default:
      return registers[0];
  }
}

/**
 * Encodes a JavaScript value into Modbus write payload (number, number[] or boolean).
 */
export function encodeFieldValue(
  field: TSchemaField,
  value: unknown,
  defaultWordOrder: TSchemaWordOrder = 'BE'
): { isBit: boolean; data: number | number[] | boolean } {
  const table = getFieldTable(field);
  const isBit = table === 'coil' || table === 'discrete';

  if (isBit) {
    return { isBit: true, data: Boolean(value) };
  }

  const numField = field as INumericFieldDefinition;
  const wo = numField.wordOrder ?? defaultWordOrder;

  switch (field.type) {
    case 'uint16': {
      const num = Number(value);
      return { isBit: false, data: Math.round(num) & 0xffff };
    }

    case 'int16': {
      const num = Number(value);
      const unscaled = Math.round(num);
      return { isBit: false, data: (unscaled < 0 ? unscaled + 0x10000 : unscaled) & 0xffff };
    }

    case 'uint32':
    case 'int32': {
      const num = Number(value);
      const unscaled = Math.round(num);
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      if (field.type === 'int32') view.setInt32(0, unscaled, false);
      else view.setUint32(0, unscaled, false);
      const u8 = new Uint8Array(buf);
      const w1 = (u8[0]! << 8) | u8[1]!;
      const w2 = (u8[2]! << 8) | u8[3]!;
      return { isBit: false, data: wo === 'LE' ? [w2, w1] : [w1, w2] };
    }

    case 'float32': {
      const num = Number(value);
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setFloat32(0, num, false);
      const u8 = new Uint8Array(buf);
      const w1 = (u8[0]! << 8) | u8[1]!;
      const w2 = (u8[2]! << 8) | u8[3]!;
      return { isBit: false, data: wo === 'LE' ? [w2, w1] : [w1, w2] };
    }

    case 'float64': {
      const num = Number(value);
      const buf = new ArrayBuffer(8);
      const view = new DataView(buf);
      view.setFloat64(0, num, false);
      const u8 = new Uint8Array(buf);
      const w1 = (u8[0]! << 8) | u8[1]!;
      const w2 = (u8[2]! << 8) | u8[3]!;
      const w3 = (u8[4]! << 8) | u8[5]!;
      const w4 = (u8[6]! << 8) | u8[7]!;
      return { isBit: false, data: wo === 'LE' ? [w4, w3, w2, w1] : [w1, w2, w3, w4] };
    }

    case 'boolean': {
      return { isBit: false, data: value ? 1 : 0 };
    }

    default:
      throw new Error(`Unsupported write encoding for field type: ${field.type}`);
  }
}

/**
 * Builds a DataView from 16-bit register values respecting word order.
 */
function buildDataView(registers: number[], wordOrder: TSchemaWordOrder): DataView {
  const count = registers.length;
  const buf = new ArrayBuffer(count * 2);
  const u8 = new Uint8Array(buf);

  // If wordOrder is LE, swap word order (e.g. for 2 words: [w1, w0])
  const orderedRegs = wordOrder === 'LE' ? registers.slice().reverse() : registers;

  for (let i = 0; i < count; i++) {
    const val = orderedRegs[i] ?? 0;
    u8[i * 2] = (val >> 8) & 0xff;
    u8[i * 2 + 1] = val & 0xff;
  }

  return new DataView(buf);
}
