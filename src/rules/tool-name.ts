import type { Rule } from '../types.js';
import { list, otherCharacters, safeName } from '../util/names.js';

// MCP's tool names (2025-11-25): 1 to 128 ASCII letters, digits, "_", "-" and ".".
const MAX_LENGTH = 128;

/**
 * A name outside the characters MCP allows breaks the hosts that check it, and the model APIs
 * they pass it on to: a space or a slash is the usual reason a server's tools don't show up.
 */
export const toolName: Rule = {
  name: 'tool-name',
  description: 'Tool names use only the characters MCP allows, and at most 128 of them.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      const { name } = tool;
      const target = { kind: 'tool', name, path: 'name' } as const;
      if (name.length === 0) {
        report({ target, message: 'The tool’s name is empty.', fix: 'Give it a name.' });
        continue;
      }
      const other = otherCharacters(name);
      if (other.length > 0) {
        report({
          target,
          message: `The name has ${list(other)}: MCP allows only ASCII letters, digits, "_", "-" and ".".`,
          fix: `Rename it "${safeName(name, MAX_LENGTH) || 'tool'}".`,
        });
      }
      if (name.length > MAX_LENGTH) {
        report({
          target,
          message: `The name is ${name.length} characters, over MCP’s ${MAX_LENGTH}.`,
          fix: 'Shorten it: say the action and the thing, and leave the rest to the description.',
        });
      }
    }
  },
};
