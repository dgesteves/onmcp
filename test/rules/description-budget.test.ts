import { expect, test } from 'vitest';

import { descriptionBudget } from '../../src/rules/description-budget.js';
import { run } from '../helpers.js';

const check = (description: string | undefined, options?: { maxTokens: number }) =>
  run(
    descriptionBudget,
    { tools: [{ name: 'search', description, inputSchema: { type: 'object' } }] },
    options,
  );

test('passes a description in the budget, and one at it exactly', () => {
  expect(check('Searches the docs for a phrase, and returns the matching pages.')).toEqual([]);
  expect(check('a'.repeat(2000))).toEqual([]);
});

test('reports a description over the budget, and says what it costs', () => {
  expect(check('word '.repeat(500))).toEqual([
    {
      rule: 'description-budget',
      severity: 'warning',
      target: { kind: 'tool', name: 'search', path: 'description' },
      message:
        'The description is about 625 tokens, over the budget of 500: a host sends it to the model with every request, whether it calls the tool or not.',
      fix: 'Keep what the model needs to choose the tool and call it. Move reference material into a resource, or into what the tool returns.',
    },
  ]);
});

test('writes large numbers with separators', () => {
  expect(check('a'.repeat(8000))[0]?.message).toMatch(/^The description is about 2,000 tokens,/);
});

test('counts Chinese, Japanese and Korean a character a token', () => {
  expect(check('検索'.repeat(250))).toEqual([]);
  expect(check('検索'.repeat(251))).toHaveLength(1);
});

test('maxTokens sets the budget', () => {
  const description = 'word '.repeat(100);
  expect(check(description)).toEqual([]);
  expect(check(description, { maxTokens: 100 })[0]?.message).toMatch(
    /^The description is about 125 tokens, over the budget of 100:/,
  );
});

test('leaves a tool with no description to tool-description', () => {
  expect(check(undefined)).toEqual([]);
});
