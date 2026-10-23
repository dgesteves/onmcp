import type { JsonSchema, Rule } from '../types.js';
import { isSchema, resolveRef, walk } from '../util/schema.js';

/**
 * The model fills in each argument from its name, its schema and its description. With no
 * description it has only the name: "q" could be a search query, a quota or a queue.
 */
export const paramDescription: Rule = {
  name: 'param-description',
  description: 'Every argument in a tool’s inputSchema has a description, at every depth.',
  severity: 'warning',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      for (const { schema, path } of walk(tool.inputSchema, 'inputSchema')) {
        if (!isSchema(schema.properties)) continue;
        for (const [name, property] of Object.entries(schema.properties)) {
          if (!isSchema(property) || described(tool.inputSchema, property)) continue;
          report({
            target: { kind: 'tool', name: tool.name, path: `${path}.properties.${name}` },
            message: `"${name}" has no description: the model fills it in from its name alone.`,
            fix: `Say what "${name}" is, in what format, with an example value.`,
          });
        }
      }
    }
  },
};

// A description on the property, or on the local schema its $ref points to.
function described(root: JsonSchema, property: JsonSchema): boolean {
  if (hasText(property.description)) return true;
  const target = resolveRef(root, property.$ref);
  return target !== undefined && hasText(target.description);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}
