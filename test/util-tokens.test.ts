import { expect, test } from 'vitest';

import { estimateTokens } from '../src/util/tokens.js';

test('estimateTokens counts about four characters a token', () => {
  expect(estimateTokens('')).toBe(0);
  expect(estimateTokens('a')).toBe(1);
  expect(estimateTokens('Searches the docs.')).toBe(5);
});

test('estimateTokens counts each Chinese, Japanese or Korean character as a token', () => {
  expect(estimateTokens('文書を検索')).toBe(5);
  expect(estimateTokens('검색')).toBe(2);
  expect(estimateTokens('Search 文書')).toBe(4);
});
