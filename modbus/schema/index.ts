// modbus/schema/index.ts

import type { ISchemaDefinition, TSchemaFieldsDefinition } from './types.js';

export * from './types.js';
export { BoundSchema, createBoundSchema } from './bound-schema.js';
export {
  getFieldLength,
  getFieldTable,
  getGroupLength,
  isSchemaGroup,
  subFieldToField,
  decodeFieldValue,
  encodeFieldValue,
} from './codec.js';

/**
 * Defines a device schema with strong type inference.
 *
 * @param definition - Schema configuration and fields definition.
 * @returns The typed schema definition object.
 */
export function defineSchema<TFields extends TSchemaFieldsDefinition>(
  definition: ISchemaDefinition<TFields>
): ISchemaDefinition<TFields> {
  return definition;
}
