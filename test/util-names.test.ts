import { expect, test } from 'vitest';

import { list, otherCharacters, safeName } from '../src/util/names.js';

test.each([
  ['search_docs', []],
  ['search docs', ['a space']],
  ['repos/list, all', ['"/"', '","', 'a space']],
  ['a\tb\nc', ['whitespace']],
  ['créer', ['"é" (U+00E9)']],
  ['tag\u{e0041}', ['"\u{e0041}" (U+E0041)']],
])('otherCharacters finds those in %j', (name, expected) => {
  expect(otherCharacters(name)).toEqual(expected);
});

test.each([
  ['search docs', 128, 'search_docs'],
  ['repos/list, all', 128, 'repos_list_all'],
  ['créer page', 128, 'creer_page'],
  ['uids[]', 64, 'uids'],
  ['$.xgafv', 64, 'xgafv'],
  ['filter[status]', 64, 'filter_status'],
  ['???', 64, ''],
  ['a b c', 3, 'a_b'],
])('safeName makes %j into a name', (name, maxLength, expected) => {
  expect(safeName(name, maxLength)).toBe(expected);
});

test('list writes items in a sentence', () => {
  expect(list([])).toBe('');
  expect(list(['a'])).toBe('a');
  expect(list(['a', 'b'])).toBe('a and b');
  expect(list(['a', 'b', 'c'])).toBe('a, b and c');
});
