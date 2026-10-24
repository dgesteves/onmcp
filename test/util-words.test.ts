import { expect, test } from 'vitest';

import { words } from '../src/util/words.js';

test.each([
  ['delete_file', ['delete', 'file']],
  ['deleteFile', ['delete', 'file']],
  ['delete-file', ['delete', 'file']],
  ['files.delete', ['files', 'delete']],
  ['HTTPDelete', ['http', 'delete']],
  ['searchV2', ['search', 'v2']],
  ['_private__name_', ['private', 'name']],
  ['', []],
])('words splits %j', (name, expected) => {
  expect(words(name)).toEqual(expected);
});
