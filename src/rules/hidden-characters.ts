import type { Report, Rule, Target } from '../types.js';
import { strings } from '../util/strings.js';

// Characters a person reviewing a tool doesn't see, and a model reads: C0 and C1 controls (but
// tab, line feed and carriage return), zero-width and bidi characters, fillers, variation
// selectors, and the tag characters that spell ASCII invisibly.
const INVISIBLE: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
];

const NAMES: Record<number, string> = {
  0x00ad: 'soft hyphen',
  0x061c: 'Arabic letter mark',
  0x200b: 'zero-width space',
  0x200c: 'zero-width non-joiner',
  0x200d: 'zero-width joiner',
  0x200e: 'left-to-right mark',
  0x200f: 'right-to-left mark',
  0x202a: 'left-to-right embedding',
  0x202b: 'right-to-left embedding',
  0x202c: 'pop directional formatting',
  0x202d: 'left-to-right override',
  0x202e: 'right-to-left override',
  0x2060: 'word joiner',
  0x2066: 'left-to-right isolate',
  0x2067: 'right-to-left isolate',
  0x2068: 'first strong isolate',
  0x2069: 'pop directional isolate',
  0xfeff: 'zero-width no-break space',
};

const FIX = 'Remove them: a person reviewing the server can’t see them, and the model reads them.';

/**
 * Text a model reads but a person reviewing the server doesn't see is how a tool hides an
 * instruction: Unicode tag characters spell whole sentences invisibly, and bidi overrides make
 * text read differently than it shows (Trojan Source). Nothing a tool says needs them.
 */
export const hiddenCharacters: Rule = {
  name: 'hidden-characters',
  description: 'No invisible characters in any text a model reads: names, descriptions, schemas.',
  severity: 'error',
  check({ snapshot, report }) {
    const scan = (target: (path: string) => Target, value: unknown) => {
      for (const [path, text] of strings(value, '')) {
        const problem = inspect(text, target(path), path);
        if (problem) report(problem);
      }
    };
    scan((path) => ({ kind: 'server', path }), {
      ...(snapshot.server && { server: snapshot.server }),
      ...(snapshot.instructions !== undefined && { instructions: snapshot.instructions }),
    });
    for (const tool of snapshot.tools) {
      scan((path) => ({ kind: 'tool', name: tool.name, path }), tool);
    }
    for (const prompt of snapshot.prompts) {
      scan((path) => ({ kind: 'prompt', name: prompt.name, path }), prompt);
    }
    for (const resource of snapshot.resources) {
      scan((path) => ({ kind: 'resource', uri: resource.uri, path }), resource);
    }
    for (const template of snapshot.resourceTemplates) {
      const { uriTemplate } = template;
      scan((path) => ({ kind: 'resource-template', uriTemplate, path }), template);
    }
  },
};

function inspect(text: string, target: Target, path: string): Report | undefined {
  const characters = Array.from(text);
  if (!characters.some(isInvisible)) return undefined;
  const found: number[] = [];
  let hidden = '';
  for (const [index, character] of characters.entries()) {
    if (!isInvisible(character) || allowed(characters, index)) continue;
    const code = character.codePointAt(0) ?? 0;
    found.push(code);
    if (code >= 0xe0020 && code <= 0xe007e) hidden += String.fromCodePoint(code - 0xe0000);
  }
  if (found.length === 0) return undefined;

  const label = visible(path.includes('.') ? path : `The ${path}`);
  if (hidden.trim()) {
    const shown = hidden.length > 80 ? `${hidden.slice(0, 80)}…` : hidden;
    return {
      target,
      message: `${label} has hidden text in Unicode tag characters, which the model reads and a person doesn’t see: "${shown}".`,
      fix: FIX,
    };
  }
  return { target, message: `${label} has ${count(found.length)}: ${summarize(found)}.`, fix: FIX };
}

// The invisible characters that are part of how emoji and ideographs are written: a zero-width
// joiner between emoji, one variation selector after a character it applies to, and the tag
// characters of a subdivision flag such as England's.
function allowed(characters: string[], index: number): boolean {
  const code = characters[index]?.codePointAt(0) ?? 0;
  const before = characters[index - 1] ?? '';
  const after = characters[index + 1] ?? '';
  if (code === 0x200d) return isEmoji(before) && /\p{Extended_Pictographic}/u.test(after);
  if (code === 0xfe0e || code === 0xfe0f) return /\p{Emoji}/u.test(before);
  if (code >= 0xe0100 && code <= 0xe01ef) return /\p{Ideographic}/u.test(before);
  if (code >= 0xe0020 && code <= 0xe007f) {
    let start = index;
    while (start > 0 && isTag(characters[start - 1])) start--;
    let end = index;
    while (end < characters.length - 1 && isTag(characters[end + 1])) end++;
    return (
      characters[start - 1]?.codePointAt(0) === 0x1f3f4 &&
      characters[end]?.codePointAt(0) === 0xe007f
    );
  }
  return false;
}

function isInvisible(character: string | undefined): boolean {
  const code = character?.codePointAt(0) ?? -1;
  return INVISIBLE.some(([from, to]) => code >= from && code <= to);
}

function isEmoji(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  // A skin tone, or the variation selector that makes the character before it an emoji.
  if ((code >= 0x1f3fb && code <= 0x1f3ff) || code === 0xfe0f) return true;
  return /\p{Extended_Pictographic}/u.test(character);
}

function isTag(character: string | undefined): boolean {
  const code = character?.codePointAt(0) ?? 0;
  return code >= 0xe0020 && code <= 0xe007f;
}

function summarize(codes: number[]): string {
  const counts = new Map<number, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts]
    .map(([code, times]) => {
      const name = NAMES[code];
      return `${hex(code)}${name ? ` (${name})` : ''}${times > 1 ? ` ×${times}` : ''}`;
    })
    .join(', ');
}

function count(total: number): string {
  return total === 1 ? 'an invisible character' : `${total} invisible characters`;
}

function hex(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

// The text with each invisible character written as its code point, so the output shows it.
function visible(text: string): string {
  return Array.from(text, (character) =>
    isInvisible(character) ? `<${hex(character.codePointAt(0) ?? 0)}>` : character,
  ).join('');
}
