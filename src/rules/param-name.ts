import type { Rule } from '../types.js';
import { list, otherCharacters, safeName } from '../util/names.js';
import { isSchema } from '../util/schema.js';

// The Claude API's pattern for the keys of a tool's input_schema.properties: ^[a-zA-Z0-9_.-]{1,64}$.
const MAX_LENGTH = 64;
const CONSEQUENCE = 'a host that uses it drops the tool, or fails every request that lists it';

/**
 * The Claude API rejects a tool whose arguments are named outside its pattern, and with it the whole
 * request: every turn fails while the tool is listed, or the host drops the tool without saying
 * so. Servers generated from OpenAPI specs are where such names come from: `uids[]`, `$.xgafv`.
 */
export const paramName: Rule = {
  name: 'param-name',
  description:
    'Argument names use only ASCII letters, digits, "_", "-" and ".", and at most 64 of them.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      const { properties } = tool.inputSchema;
      // schema-object reports properties that aren't an object.
      if (!isSchema(properties)) continue;
      for (const name of Object.keys(properties)) {
        const target = {
          kind: 'tool',
          name: tool.name,
          path: `inputSchema.properties.${name}`,
        } as const;
        if (name.length === 0) {
          report({
            target,
            message: `An argument’s name is empty: the Claude API takes 1 to ${MAX_LENGTH} characters, so ${CONSEQUENCE}.`,
            fix: 'Give it a name.',
          });
          continue;
        }
        const other = otherCharacters(name);
        if (other.length > 0) {
          report({
            target,
            message: `"${name}" has ${list(other)}: the Claude API takes only ASCII letters, digits, "_", "-" and "." in an argument’s name, so ${CONSEQUENCE}.`,
            fix: `Rename it "${safeName(name, MAX_LENGTH) || 'value'}", and map it back to "${name}" where the server uses it.`,
          });
        }
        if (name.length > MAX_LENGTH) {
          report({
            target,
            message: `"${name}" is ${name.length} characters, over the ${MAX_LENGTH} the Claude API takes in an argument’s name, so ${CONSEQUENCE}.`,
            fix: `Shorten it to ${MAX_LENGTH} characters or fewer, and leave the rest to its description.`,
          });
        }
      }
    }
  },
};
