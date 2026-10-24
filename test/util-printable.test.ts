import { expect, test } from 'vitest';

import { printable } from '../src/util/printable.js';

test.each([
  ['clear\u001b[2J', 'clear<U+001B>[2J'],
  ['link\u001b]8;;https://example.com\u0007', 'link<U+001B>]8;;https://example.com<U+0007>'],
  ['csi\u009b31m', 'csi<U+009B>31m'],
  ['del\u007f', 'del<U+007F>'],
  ['bidi‮evil⁦', 'bidi<U+202E>evil<U+2066>'],
  ['two\nlines\r\tand a tab', 'two<U+000A>lines<U+000D><U+0009>and a tab'],
])('printable writes the controls in %j as code points', (text, shown) => {
  expect(printable(text)).toBe(shown);
});

test('printable leaves text, accents, emoji and zero-width joiners be', () => {
  const text = 'Searches the docs: café, 検索, 👩‍💻, "quotes" and → arrows.';
  expect(printable(text)).toBe(text);
});

test('printable keeps line breaks with lines, and escapes the rest', () => {
  expect(printable('one\ntwo\u001b[2J', { lines: true })).toBe('one\ntwo<U+001B>[2J');
});
