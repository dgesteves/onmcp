import { expect, test } from 'vitest';

import { contextBudget } from '../../src/rules/context-budget.js';
import type { Tool } from '../../src/types.js';
import { run } from '../helpers.js';

// As JSON, each tool is 61 characters and its description: a is about 116 tokens, b 66, c 41 and
// d 26, 249 in all.
const tool = (name: string, length: number): Tool => ({
  name,
  description: 'x'.repeat(length),
  inputSchema: { type: 'object' },
});
const tools = [tool('a', 400), tool('b', 200), tool('c', 100), tool('d', 40)];

test('passes a server in the budget', () => {
  expect(run(contextBudget, { tools, instructions: 'Use search first.' })).toEqual([]);
  expect(run(contextBudget, { tools }, { maxTokens: 249 })).toEqual([]);
});

test('reports a server over the budget, with its largest tools', () => {
  expect(run(contextBudget, { tools }, { maxTokens: 200 })).toEqual([
    {
      rule: 'context-budget',
      severity: 'warning',
      target: { kind: 'server' },
      message:
        'The server’s 4 tools are about 249 tokens, over the budget of 200: a host sends those tokens to the model with every request. The largest: a (116), b (66), c (41).',
      fix: 'Trim the largest first. With many tools, merge the ones that do nearly the same thing, or split the server so a host loads only what it needs.',
    },
  ]);
});

test('counts the instructions, and lists them with the tools', () => {
  const [problem] = run(
    contextBudget,
    { tools, instructions: 'y'.repeat(300) },
    { maxTokens: 200 },
  );
  expect(problem?.message).toBe(
    'The server’s 4 tools and instructions are about 324 tokens, over the budget of 200: a host sends those tokens to the model with every request. The largest: a (116), the instructions (75), b (66).',
  );
});

test('counts the input schema, not only the description', () => {
  const schema = {
    type: 'object',
    properties: { query: { type: 'string', description: 'z'.repeat(400) } },
  };
  const [problem] = run(
    contextBudget,
    { tools: [{ name: 'a', description: 'Searches.', inputSchema: schema }] },
    { maxTokens: 100 },
  );
  expect(problem?.message).toMatch(/^The server’s tool is about 1\d\d tokens, over the budget/);
});

test('says it well for one tool, or instructions alone', () => {
  const message = (partial: Parameters<typeof run>[1]) =>
    run(contextBudget, partial, { maxTokens: 50 })[0]?.message;
  expect(message({ tools: [tool('a', 400)] })).toBe(
    'The server’s tool is about 116 tokens, over the budget of 50: a host sends those tokens to the model with every request.',
  );
  expect(message({ instructions: 'y'.repeat(300) })).toMatch(
    /^The server’s instructions are about 75 tokens, over the budget of 50: [^.]*\.$/,
  );
  expect(message({ tools: [tool('a', 400)], instructions: 'y'.repeat(300) })).toMatch(
    /^The server’s tool and instructions are about 191 tokens,.* The largest: a \(116\), the instructions \(75\)\.$/,
  );
});

test('passes a server with nothing in it', () => {
  expect(run(contextBudget, {}, { maxTokens: 0 })).toEqual([]);
});
