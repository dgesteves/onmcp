import type { Rule } from '../types.js';

// MCP's tool names (2025-11-25): 1 to 128 ASCII letters, digits, "_", "-" and ".".
const ALLOWED = /^[A-Za-z0-9_.-]+$/;
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
      if (!ALLOWED.test(name)) {
        const bad = [...new Set(name.replace(/[A-Za-z0-9_.-]/g, ''))].map(describe);
        report({
          target,
          message: `The name has ${list(bad)}: MCP allows only ASCII letters, digits, "_", "-" and ".".`,
          fix: `Rename it "${suggest(name)}".`,
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

function describe(character: string): string {
  if (character === ' ') return 'a space';
  if (/\s/.test(character)) return 'whitespace';
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x20 || code > 0x7e) {
    return `"${character}" (U+${code.toString(16).toUpperCase().padStart(4, '0')})`;
  }
  return `"${character}"`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

// The name with each run of characters MCP doesn't allow made into one "_".
function suggest(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_LENGTH) || 'tool'
  );
}
