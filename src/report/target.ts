import type { Target } from '../types.js';

/** How the reports name a target: `server`, `tool search`, `prompt summarize`, `resource docs://`. */
export function label(target: Target): string {
  switch (target.kind) {
    case 'server':
      return 'server';
    case 'resource':
      return `resource ${target.uri}`;
    default:
      return `${target.kind} ${target.name}`;
  }
}

// Where each list starts in a snapshot file, so a server named like one of its tools isn't it.
const SECTIONS = { tool: '"tools"', prompt: '"prompts"', resource: '"resources"' } as const;

/**
 * The line where a snapshot file defines the target: the "name" of a tool or a prompt, or the
 * "uri" of a resource, from where its list starts, or the server's "instructions". Line 1 when the
 * file writes it another way, such as with escapes JSON.stringify doesn't use.
 */
export function lineOf(target: Target, text: string): number {
  if (target.kind === 'server' && target.path !== 'instructions') return 1;
  const [key, value] =
    target.kind === 'server'
      ? ['instructions', undefined]
      : target.kind === 'resource'
        ? ['uri', target.uri]
        : ['name', target.name];
  const pattern = new RegExp(
    `"${key}"\\s*:${value === undefined ? '' : `\\s*${escape(JSON.stringify(value))}`}`,
    'g',
  );
  pattern.lastIndex =
    target.kind === 'server' ? 0 : Math.max(0, text.indexOf(SECTIONS[target.kind]));
  const match = pattern.exec(text);
  return match ? text.slice(0, match.index).split('\n').length : 1;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
