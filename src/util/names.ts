// ASCII letters, digits, "_", "-" and ".": what MCP allows in a tool's name, and what the Claude
// API allows in an argument's.
const ALLOWED = /[A-Za-z0-9_.-]/g;

/**
 * Each character in a name that isn't one of those, once, as a message names it: `a space`,
 * `"/"`, or `"é" (U+00E9)` outside printable ASCII.
 */
export function otherCharacters(name: string): string[] {
  // Once by how it's named: a tab and a line break are "whitespace", not "whitespace and
  // whitespace".
  return [...new Set(Array.from(name.replace(ALLOWED, ''), describe))];
}

/**
 * The name with each run of other characters made into one "_", accents dropped, and no "_", "-"
 * or "." at either end, cut to maxLength: `uids[]` is `uids`. Empty when nothing is left.
 */
export function safeName(name: string, maxLength: number): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, maxLength);
}

/** Items in a sentence: `a`, `a and b`, `a, b and c`. */
export function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function describe(character: string): string {
  if (character === ' ') return 'a space';
  if (/\s/.test(character)) return 'whitespace';
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x20 || code > 0x7e) {
    return `"${character}" (U+${code.toString(16).toUpperCase().padStart(4, '0')})`;
  }
  return `"${character}"`;
}
