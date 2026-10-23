import type { JsonSchema } from '../types.js';

export interface SchemaNode {
  schema: JsonSchema;
  /** From the tool, such as `inputSchema.properties.filter.items`. */
  path: string;
  /** How many schemas down from the root: the root is 0. */
  depth: number;
}

// Past this depth the walk stops, so a schema nested without end can't overflow the stack.
const MAX_DEPTH = 64;

// The keywords that hold one schema, and those that hold a map or a list of them.
const ONE = ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains'] as const;
const MAP = ['properties', 'patternProperties', '$defs', 'definitions'] as const;
const LIST = ['anyOf', 'oneOf', 'allOf', 'prefixItems', 'items'] as const;

/** Each schema in a schema, the root first, then depth first in the order its keywords are written. */
export function* walk(schema: JsonSchema, path: string, depth = 0): Generator<SchemaNode> {
  yield { schema, path, depth };
  if (depth >= MAX_DEPTH) return;
  for (const [key, value] of Object.entries(schema)) {
    if ((ONE as readonly string[]).includes(key) && isSchema(value)) {
      yield* walk(value, `${path}.${key}`, depth + 1);
    }
    if ((MAP as readonly string[]).includes(key) && isSchema(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (isSchema(child)) yield* walk(child, `${path}.${key}.${name}`, depth + 1);
      }
    }
    if ((LIST as readonly string[]).includes(key) && Array.isArray(value)) {
      for (const [index, child] of value.entries()) {
        if (isSchema(child)) yield* walk(child, `${path}.${key}.${index}`, depth + 1);
      }
    }
  }
}

export function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
