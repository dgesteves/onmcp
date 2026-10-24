import type { Rule } from '../types.js';
import { words } from '../util/words.js';

// Words at the end of a name that mark one version of a tool apart from another.
const VERSION = /^(?:v\d+|\d+|new|old|legacy|beta|alpha|next|deprecated|experimental)$/;

// How close two names can be, from closest: each step compares more loosely than the one before.
const STEPS: readonly (readonly [string, (words: string[]) => string[]])[] = [
  ['case and separators', (words) => words],
  ['a plural', (words) => words.map(singular)],
  // The version first, so "news" in search_news isn't read as "new".
  ['a version', (words) => withoutVersion(words).map(singular)],
];

/**
 * A model picks a tool by its name before it reads the description. Two names that differ only
 * in how they're written, in a plural or in a version, such as get_user and get_users, or search
 * and search_v2, don't say which one to call, and the model calls one for the other.
 */
export const similarNames: Rule = {
  name: 'similar-names',
  description:
    'No two tool names differ only in case, separators, a plural or a version, such as get_user and get_users.',
  severity: 'warning',
  check({ snapshot, report }) {
    const seen: { name: string; keys: string[] }[] = [];
    for (const tool of snapshot.tools) {
      const keys = STEPS.map(([, normalize]) => normalize(words(tool.name)).join(''));
      for (const other of seen) {
        // The same name twice is unique-names'.
        if (other.name === tool.name) continue;
        const step = keys.findIndex((key, index) => key !== '' && key === other.keys[index]);
        const how = STEPS[step]?.[0];
        if (how === undefined) continue;
        report({
          target: { kind: 'tool', name: tool.name, path: 'name' },
          message: `"${tool.name}" and "${other.name}" differ only in ${how}: a model picks a tool by its name first, and can call one for the other.`,
          fix: 'Name each for what sets it apart, such as get_user and list_users. If one replaces the other, remove the old one.',
        });
        break;
      }
      seen.push({ name: tool.name, keys });
    }
  },
};

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function withoutVersion(words: string[]): string[] {
  let end = words.length;
  while (end > 1 && VERSION.test(words[end - 1] ?? '')) end--;
  return words.slice(0, end);
}
