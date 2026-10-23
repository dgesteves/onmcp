import type { JsonSchema, Rule, Tool } from '../types.js';

/**
 * MCP requires a tool's inputSchema, and its outputSchema when it has one, to be an object schema:
 * arguments are named, and structured content is a JSON object. A schema with no type, or another
 * one, is dropped by the hosts that check it, and leaves the others to guess.
 */
export const schemaObject: Rule = {
  name: 'schema-object',
  description:
    'A tool’s inputSchema and outputSchema have type "object", with readable properties.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      checkSchema(tool, 'inputSchema', tool.inputSchema);
      if (tool.outputSchema) checkSchema(tool, 'outputSchema', tool.outputSchema);
    }

    function checkSchema(tool: Tool, key: 'inputSchema' | 'outputSchema', schema: JsonSchema) {
      const target = (path: string) => ({ kind: 'tool', name: tool.name, path }) as const;
      const what =
        key === 'inputSchema'
          ? 'a tool’s arguments are named'
          : 'structured content is a JSON object';
      if (schema.type === undefined) {
        report({
          target: target(`${key}.type`),
          message: `${key} has no "type": MCP requires "object", and hosts that check it drop the tool.`,
          fix: 'Add "type": "object".',
        });
      } else if (schema.type !== 'object') {
        report({
          target: target(`${key}.type`),
          message: `${key}’s type is ${JSON.stringify(schema.type)}: MCP requires "object", since ${what}.`,
          fix:
            key === 'inputSchema'
              ? 'Make it "object", and put the value in a named property.'
              : 'Make it "object", and put the result in a named property.',
        });
      }

      const { properties, required } = schema;
      if (properties !== undefined && !isPlainObject(properties)) {
        report({
          target: target(`${key}.properties`),
          message: `${key}.properties is ${describe(properties)}: JSON Schema needs an object that maps each name to its schema.`,
          fix: 'Make it { "name": { "type": … }, … }.',
        });
      }
      if (
        required !== undefined &&
        !(Array.isArray(required) && required.every((name) => typeof name === 'string'))
      ) {
        report({
          target: target(`${key}.required`),
          message: `${key}.required is ${describe(required)}: JSON Schema needs an array of property names.`,
          fix: 'Make it ["name", …], or mark nothing required by leaving it out.',
        });
      }
    }
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`;
}
