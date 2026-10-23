import type { Rule } from '../types.js';
import { closest } from '../util/closest.js';
import { isSchema, walk } from '../util/schema.js';

/**
 * A name in required that properties doesn't have: the model must send an argument it has no
 * schema for, and with additionalProperties false, no call can pass validation. It's nearly always
 * a typo, or a property renamed in one place.
 */
export const requiredProperties: Rule = {
  name: 'required-properties',
  description: 'required names only properties the schema has, at every depth.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      const roots = [
        ['inputSchema', tool.inputSchema],
        ['outputSchema', tool.outputSchema],
      ] as const;
      for (const [key, root] of roots) {
        if (!root) continue;
        for (const { schema, path } of walk(root, key)) {
          const { properties, required } = schema;
          // schema-object reports properties and required that aren't readable.
          if (!isSchema(properties) || !Array.isArray(required)) continue;
          const names = Object.keys(properties);
          for (const name of required) {
            if (typeof name !== 'string' || Object.hasOwn(properties, name)) continue;
            const meant = closest(name, names);
            report({
              target: { kind: 'tool', name: tool.name, path: `${path}.required` },
              message:
                key === 'inputSchema'
                  ? `"${name}" is required but isn’t in properties: the model must send an argument it has no schema for.`
                  : `"${name}" is required but isn’t in properties: the tool’s own results can’t pass its output schema.`,
              fix: meant
                ? `Did you mean "${meant}"? Rename it in required.`
                : `Add "${name}" to properties, or take it out of required.`,
            });
          }
        }
      }
    }
  },
};
