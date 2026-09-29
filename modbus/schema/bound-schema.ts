// modbus/schema/bound-schema.ts

import type { IModbusClient } from '../types/public.js';
import {
  decodeFieldValue,
  encodeFieldValue,
  getFieldLength,
  getFieldTable,
  getGroupLength,
  isSchemaGroup,
  subFieldToField,
} from './codec.js';
import type {
  IBoundSchema,
  ISchemaDefinition,
  TSchemaFieldsDefinition,
  InferSchemaEntry,
  ISchemaGroupDefinition,
  TSchemaField,
} from './types.js';

export class BoundSchema<TFields extends TSchemaFieldsDefinition> implements IBoundSchema<TFields> {
  public readonly client: IModbusClient;
  public readonly definition: ISchemaDefinition<TFields>;

  constructor(client: IModbusClient, definition: ISchemaDefinition<TFields>) {
    this.client = client;
    this.definition = definition;
  }

  /**
   * Reads all or specified fields and groups defined in the schema.
   * Groups are each read in a single contiguous Modbus request.
   */
  public async read<K extends keyof TFields = keyof TFields>(
    fields?: K[]
  ): Promise<{ [P in K]: InferSchemaEntry<TFields[P]> }> {
    const defaultWordOrder = this.definition.defaultWordOrder ?? 'BE';
    const keysToProcess =
      fields && fields.length > 0
        ? (fields as string[]).filter(k => k in this.definition.fields)
        : Object.keys(this.definition.fields);

    const result: Record<string, unknown> = {};

    for (const key of keysToProcess) {
      const entry = this.definition.fields[key]!;

      if (isSchemaGroup(entry)) {
        result[key] = await this._readSingleGroup(entry, defaultWordOrder);
      } else {
        result[key] = await this._readSingleField(entry, defaultWordOrder);
      }
    }

    return result as { [P in K]: InferSchemaEntry<TFields[P]> };
  }

  /**
   * Reads a single group of registers in a single Modbus request.
   */
  public async readGroup<K extends keyof TFields>(
    groupKey: K
  ): Promise<InferSchemaEntry<TFields[K]>> {
    const key = String(groupKey);
    const entry = this.definition.fields[key];
    if (!entry) {
      throw new Error(`Group '${key}' does not exist in schema`);
    }
    if (!isSchemaGroup(entry)) {
      throw new Error(
        `Entry '${key}' is a single field, not a group. Use schema.read(['${key}']) instead`
      );
    }

    const defaultWordOrder = this.definition.defaultWordOrder ?? 'BE';
    const groupResult = await this._readSingleGroup(entry, defaultWordOrder);
    return groupResult as InferSchemaEntry<TFields[K]>;
  }

  /**
   * Writes a value to a writable field, whole group, or nested group subfield via dot notation.
   */
  public async write(key: string, value: unknown): Promise<void> {
    const defaultWordOrder = this.definition.defaultWordOrder ?? 'BE';

    // Dot notation for writing a field inside a group: e.g. 'phaseA.voltage'
    if (key.includes('.')) {
      const [groupKey, subKey] = key.split('.');
      const groupEntry = this.definition.fields[groupKey!];
      if (!groupEntry || !isSchemaGroup(groupEntry)) {
        throw new Error(`Group '${groupKey}' does not exist in schema`);
      }
      const subField = groupEntry.group[subKey!];
      if (!subField) {
        throw new Error(`Subfield '${subKey}' does not exist in group '${groupKey}'`);
      }

      const table = groupEntry.table ?? 'holding';
      if (table === 'input' || table === 'discrete') {
        throw new Error(`Cannot write to read-only table '${table}' for group '${groupKey}'`);
      }

      const syntheticField = subFieldToField(subField, groupEntry.address, table);
      const wo = subField.wordOrder ?? groupEntry.wordOrder ?? defaultWordOrder;
      const { isBit, data } = encodeFieldValue(syntheticField, value, wo);

      if (isBit) {
        await this.client.writeSingleCoil(syntheticField.address, Boolean(data));
        return;
      }

      if (Array.isArray(data)) {
        await this.client.writeMultipleRegisters(syntheticField.address, data);
      } else if (typeof data === 'number') {
        await this.client.writeSingleRegister(syntheticField.address, data);
      }
      return;
    }

    // Direct key write
    const entry = this.definition.fields[key];
    if (!entry) {
      throw new Error(`Field or group '${key}' does not exist in schema`);
    }

    // If writing an entire group:
    if (isSchemaGroup(entry)) {
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Value for group '${key}' must be an object of subfield values`);
      }
      await this.writeGroup(
        key as keyof TFields,
        value as Partial<InferSchemaEntry<TFields[keyof TFields]>>
      );
      return;
    }

    // If writing a single field:
    const table = getFieldTable(entry);
    if (table === 'input' || table === 'discrete') {
      throw new Error(`Cannot write to read-only table '${table}' for field '${key}'`);
    }

    const { isBit, data } = encodeFieldValue(entry, value, defaultWordOrder);

    if (isBit) {
      await this.client.writeSingleCoil(entry.address, Boolean(data));
      return;
    }

    if (Array.isArray(data)) {
      await this.client.writeMultipleRegisters(entry.address, data);
    } else if (typeof data === 'number') {
      await this.client.writeSingleRegister(entry.address, data);
    }
  }

  /**
   * Writes all registers of a group atomically in a single writeMultipleRegisters / writeMultipleCoils request.
   */
  public async writeGroup<K extends keyof TFields>(
    groupKey: K,
    values: Partial<InferSchemaEntry<TFields[K]>>
  ): Promise<void> {
    const key = String(groupKey);
    const entry = this.definition.fields[key];
    if (!entry) {
      throw new Error(`Group '${key}' does not exist in schema`);
    }
    if (!isSchemaGroup(entry)) {
      throw new Error(`Entry '${key}' is a single field, not a group`);
    }

    const table = entry.table ?? 'holding';
    if (table === 'input' || table === 'discrete') {
      throw new Error(`Cannot write to read-only table '${table}' for group '${key}'`);
    }

    const totalLength = getGroupLength(entry);
    if (totalLength === 0) return;

    const isBitTable = table === 'coil';
    const defaultWordOrder = entry.wordOrder ?? this.definition.defaultWordOrder ?? 'BE';

    if (isBitTable) {
      // Read current coils first to preserve unmodified bits in the block
      const currentCoils = await this.client.readCoils(entry.address, totalLength);
      const coilBuffer = Array.from(currentCoils);

      for (const [subKey, subVal] of Object.entries(values as Record<string, unknown>)) {
        const subField = entry.group[subKey];
        if (!subField) continue;
        const syntheticField = subFieldToField(subField, entry.address, table);
        const { data } = encodeFieldValue(syntheticField, subVal, defaultWordOrder);
        coilBuffer[subField.offset] = Boolean(data);
      }

      await this.client.writeMultipleCoils(entry.address, coilBuffer);
      return;
    }

    // Register table: read current registers to preserve unmodified registers
    const currentRegs = await this.client.readHoldingRegisters(entry.address, totalLength);
    const regBuffer = Array.from(currentRegs);

    for (const [subKey, subVal] of Object.entries(values as Record<string, unknown>)) {
      const subField = entry.group[subKey];
      if (!subField) continue;
      const syntheticField = subFieldToField(subField, entry.address, table);
      const wo = subField.wordOrder ?? defaultWordOrder;
      const { data } = encodeFieldValue(syntheticField, subVal, wo);

      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          regBuffer[subField.offset + i] = data[i]!;
        }
      } else if (typeof data === 'number') {
        regBuffer[subField.offset] = data;
      }
    }

    await this.client.writeMultipleRegisters(entry.address, regBuffer);
  }

  /**
   * Internal helper to read an entire group in a single contiguous Modbus request.
   */
  private async _readSingleGroup(
    group: ISchemaGroupDefinition,
    defaultWordOrder: 'BE' | 'LE'
  ): Promise<Record<string, unknown>> {
    const table = group.table ?? 'holding';
    const totalLength = getGroupLength(group);
    if (totalLength === 0) return {};

    const groupWordOrder = group.wordOrder ?? defaultWordOrder;
    let rawRegisters: number[] = [];
    let rawCoils: boolean[] = [];

    switch (table) {
      case 'holding': {
        const regData = await this.client.readHoldingRegisters(group.address, totalLength);
        rawRegisters = Array.from(regData);
        break;
      }
      case 'input': {
        const regData = await this.client.readInputRegisters(group.address, totalLength);
        rawRegisters = Array.from(regData);
        break;
      }
      case 'coil': {
        rawCoils = await this.client.readCoils(group.address, totalLength);
        break;
      }
      case 'discrete': {
        rawCoils = await this.client.readDiscreteInputs(group.address, totalLength);
        break;
      }
    }

    const groupResult: Record<string, unknown> = {};

    for (const [subKey, subField] of Object.entries(group.group)) {
      const syntheticField = subFieldToField(subField, group.address, table);
      const fieldLen = getFieldLength(syntheticField);
      const regs = rawRegisters.slice(subField.offset, subField.offset + fieldLen);
      const coils = rawCoils.slice(subField.offset, subField.offset + fieldLen);
      const wo = subField.wordOrder ?? groupWordOrder;

      groupResult[subKey] = decodeFieldValue(syntheticField, regs, coils, wo);
    }

    return groupResult;
  }

  /**
   * Internal helper to read a single field.
   */
  private async _readSingleField(
    field: TSchemaField,
    defaultWordOrder: 'BE' | 'LE'
  ): Promise<unknown> {
    const table = getFieldTable(field);
    const length = getFieldLength(field);

    let rawRegisters: number[] = [];
    let rawCoils: boolean[] = [];

    switch (table) {
      case 'holding': {
        const regData = await this.client.readHoldingRegisters(field.address, length);
        rawRegisters = Array.from(regData);
        break;
      }
      case 'input': {
        const regData = await this.client.readInputRegisters(field.address, length);
        rawRegisters = Array.from(regData);
        break;
      }
      case 'coil': {
        rawCoils = await this.client.readCoils(field.address, 1);
        break;
      }
      case 'discrete': {
        rawCoils = await this.client.readDiscreteInputs(field.address, 1);
        break;
      }
    }

    return decodeFieldValue(field, rawRegisters, rawCoils, defaultWordOrder);
  }
}

/**
 * Creates an IBoundSchema instance binding a client to a schema definition.
 */
export function createBoundSchema<TFields extends TSchemaFieldsDefinition>(
  client: IModbusClient,
  definition: ISchemaDefinition<TFields>
): IBoundSchema<TFields> {
  return new BoundSchema(client, definition);
}
