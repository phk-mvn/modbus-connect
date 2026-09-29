// modbus/schema/types.ts

import type { IModbusClient } from '../types/public.js';

/**
 * Modbus memory tables for schema fields.
 */
export type TSchemaTable = 'holding' | 'input' | 'coil' | 'discrete';

/**
 * Supported data types for schema fields.
 */
export type TSchemaFieldType =
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'float64'
  | 'boolean'
  | 'bitmask'
  | 'string';

/**
 * Word order for multi-register 32-bit and 64-bit numbers.
 */
export type TSchemaWordOrder = 'BE' | 'LE';

/**
 * Base properties common to all schema field definitions.
 */
export interface IBaseFieldDefinition<TType extends TSchemaFieldType = TSchemaFieldType> {
  /** 0-based Modbus register or coil address. */
  address: number;
  /** Data type of the field. */
  type: TType;
  /** Memory table where this field resides. Defaults to 'holding' (or 'coil' for booleans). */
  table?: TSchemaTable;
  /** Human-readable description of the field. */
  description?: string;
}

/**
 * Definition for numerical fields (16, 32, or 64-bit).
 */
export interface INumericFieldDefinition extends IBaseFieldDefinition<
  'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'float64'
> {
  /** Word order for multi-register values (BE or LE). Defaults to schema default or 'BE'. */
  wordOrder?: TSchemaWordOrder;
  /** Engineering unit (e.g. 'V', 'A', '°C', 'kW'). Informational. */
  unit?: string;
}

/**
 * Definition for boolean fields (coils, discrete inputs, or single-bit flags).
 */
export interface IBooleanFieldDefinition extends IBaseFieldDefinition<'boolean'> {
  /**
   * If table is 'holding' or 'input', specifies the 0-indexed bit position (0..15).
   * If omitted on register tables, non-zero register value is considered true.
   */
  bit?: number;
}

/**
 * Definition for bitmask fields unpacked from a single 16-bit register.
 */
export interface IBitmaskFieldDefinition<
  TBits extends Record<string, number> = Record<string, number>,
> extends IBaseFieldDefinition<'bitmask'> {
  /** Mapping of flag names to bit indices (0..15). */
  bits: TBits;
}

/**
 * Definition for string fields read from consecutive registers.
 */
export interface IStringFieldDefinition extends IBaseFieldDefinition<'string'> {
  /** Length of the string in characters (bytes). 2 characters per register. */
  length: number;
  /** Character encoding (defaults to 'ascii'). */
  encoding?: 'ascii' | 'utf-8';
}

/**
 * Union of all supported single-field definitions.
 */
export type TSchemaField =
  | INumericFieldDefinition
  | IBooleanFieldDefinition
  | IBitmaskFieldDefinition
  | IStringFieldDefinition;

/**
 * Subfield definition inside a group.
 * Uses `offset` relative to the group's starting address.
 */
export interface IGroupSubFieldDefinition {
  /** Register offset from the group's base address (0-indexed). */
  offset: number;
  /** Data type of the subfield. */
  type: TSchemaFieldType;
  /** Word order for multi-register values (BE or LE). Defaults to group or schema default. */
  wordOrder?: TSchemaWordOrder;
  /** Engineering unit. Informational. */
  unit?: string;
  /** Human-readable description. */
  description?: string;
  /** Length in characters (for 'string' type). */
  length?: number;
  /** Bit mapping (for 'bitmask' type). */
  bits?: Record<string, number>;
  /** Bit index (for 'boolean' in register table). */
  bit?: number;
}

/**
 * Map of subfields inside a group.
 */
export type TGroupSubFields = Record<string, IGroupSubFieldDefinition>;

/**
 * Definition of a contiguous block/group of registers.
 * Read and written as a single Modbus transaction.
 */
export interface ISchemaGroupDefinition<TGroup extends TGroupSubFields = TGroupSubFields> {
  /** Base starting Modbus register or coil address for the group. */
  address: number;
  /** Memory table where this group resides. Defaults to 'holding'. */
  table?: TSchemaTable;
  /** Default word order for multi-register subfields. */
  wordOrder?: TSchemaWordOrder;
  /** Human-readable description of the group. */
  description?: string;
  /** Nested subfield definitions with relative offsets. */
  group: TGroup;
}

/**
 * A schema entry can be a single field or a group.
 */
export type TSchemaEntry = TSchemaField | ISchemaGroupDefinition;

/**
 * Record of named entries in a device schema.
 */
export type TSchemaFieldsDefinition = Record<string, TSchemaEntry>;

/**
 * Top-level configuration object for defining a device schema.
 */
export interface ISchemaDefinition<
  TFields extends TSchemaFieldsDefinition = TSchemaFieldsDefinition,
> {
  /** Optional name or model of the device. */
  name?: string;
  /** Default word order for multi-register fields. Defaults to 'BE'. */
  defaultWordOrder?: TSchemaWordOrder;
  /** Map of field or group definitions. */
  fields: TFields;
}

/**
 * Type inference helper for a single field definition.
 */
export type InferFieldType<T extends TSchemaField> = T extends INumericFieldDefinition
  ? number
  : T extends IBooleanFieldDefinition
    ? boolean
    : T extends IBitmaskFieldDefinition<infer TBits>
      ? { [K in keyof TBits]: boolean }
      : T extends IStringFieldDefinition
        ? string
        : unknown;

/**
 * Type inference helper for a group subfield.
 */
export type InferSubFieldType<T extends IGroupSubFieldDefinition> = T['type'] extends
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32'
  | 'float64'
  ? number
  : T['type'] extends 'boolean'
    ? boolean
    : T['type'] extends 'string'
      ? string
      : T['type'] extends 'bitmask'
        ? T['bits'] extends Record<string, number>
          ? { [K in keyof T['bits']]: boolean }
          : Record<string, boolean>
        : unknown;

/**
 * Type inference helper for an entire group.
 */
export type InferGroupType<TGroup extends TGroupSubFields> = {
  [K in keyof TGroup]: InferSubFieldType<TGroup[K]>;
};

/**
 * Type inference helper for any schema entry (field or group).
 */
export type InferSchemaEntry<T extends TSchemaEntry> =
  T extends ISchemaGroupDefinition<infer TGroup>
    ? InferGroupType<TGroup>
    : T extends TSchemaField
      ? InferFieldType<T>
      : unknown;

/**
 * Infers the full result object type from a schema's fields map.
 */
export type InferSchema<TFields extends TSchemaFieldsDefinition> = {
  [K in keyof TFields]: InferSchemaEntry<TFields[K]>;
};

/**
 * A device schema bound to a specific ModbusClient instance.
 */
export interface IBoundSchema<TFields extends TSchemaFieldsDefinition = TSchemaFieldsDefinition> {
  /** Reference to the underlying ModbusClient. */
  readonly client: IModbusClient;
  /** The schema definition object. */
  readonly definition: ISchemaDefinition<TFields>;

  /**
   * Reads all fields and groups (or a specified subset) defined in the schema.
   * Groups are each read in a single contiguous Modbus request.
   *
   * @param fields - Optional array of field/group keys to read. Reads all if omitted.
   * @returns A promise resolving to an object containing the decoded values.
   */
  read<K extends keyof TFields = keyof TFields>(
    fields?: K[]
  ): Promise<{ [P in K]: InferSchemaEntry<TFields[P]> }>;

  /**
   * Reads a single group of registers in a single Modbus request.
   *
   * @param groupKey - The key of the group defined in the schema.
   * @returns A promise resolving to the decoded group object.
   */
  readGroup<K extends keyof TFields>(groupKey: K): Promise<InferSchemaEntry<TFields[K]>>;

  /**
   * Writes a value to a writable field, or a group subfield using dot notation (e.g. 'phaseA.voltage').
   *
   * @param key - Field key or 'groupKey.subFieldKey'.
   * @param value - Value matching the target field definition.
   */
  write(key: string, value: unknown): Promise<void>;

  /**
   * Writes registers of a group atomically in a single writeMultipleRegisters / writeMultipleCoils request.
   *
   * @param groupKey - The key of the group.
   * @param values - Object containing values for the group subfields to update.
   */
  writeGroup<K extends keyof TFields>(
    groupKey: K,
    values: Partial<InferSchemaEntry<TFields[K]>>
  ): Promise<void>;
}
