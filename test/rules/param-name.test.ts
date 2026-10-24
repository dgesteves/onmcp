import { expect, test } from 'vitest';

import { paramName } from '../../src/rules/param-name.js';
import type { JsonSchema } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (...names: string[]) =>
  run(paramName, {
    tools: [
      {
        name: 'subscriptions_list',
        description: 'A tool.',
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(names.map((name) => [name, { type: 'string' }])),
        },
      },
    ],
  });

test('passes the names the Claude API takes', () => {
  expect(check('query', 'page-size', 'filter.status', 'A1', '_id', 'x'.repeat(64))).toEqual([]);
});

test('reports brackets, and suggests a name to map back from', () => {
  expect(check('uids[]')).toEqual([
    {
      rule: 'param-name',
      severity: 'error',
      target: { kind: 'tool', name: 'subscriptions_list', path: 'inputSchema.properties.uids[]' },
      message:
        '"uids[]" has "[" and "]": the Claude API takes only ASCII letters, digits, "_", "-" and "." in an argument’s name, so a host that uses it drops the tool, or fails every request that lists it.',
      fix: 'Rename it "uids", and map it back to "uids[]" where the server uses it.',
    },
  ]);
});

test('names each character it doesn’t take, once', () => {
  const [dollar, space] = check('$.xgafv', 'page size', 'ok');
  expect(dollar?.message).toMatch(/^"\$\.xgafv" has "\$": /);
  expect(dollar?.fix).toBe(
    'Rename it "xgafv", and map it back to "$.xgafv" where the server uses it.',
  );
  expect(space?.message).toMatch(/^"page size" has a space: /);
  expect(space?.fix).toMatch(/^Rename it "page_size",/);
});

test('reports a name over 64 characters', () => {
  const name = 'x'.repeat(65);
  expect(check(name).map((problem) => problem.message)).toEqual([
    `"${name}" is 65 characters, over the 64 the Claude API takes in an argument’s name, so a host that uses it drops the tool, or fails every request that lists it.`,
  ]);
});

test('reports an empty name', () => {
  expect(check('')).toEqual([
    expect.objectContaining({
      target: { kind: 'tool', name: 'subscriptions_list', path: 'inputSchema.properties.' },
      message:
        'An argument’s name is empty: the Claude API takes 1 to 64 characters, so a host that uses it drops the tool, or fails every request that lists it.',
      fix: 'Give it a name.',
    }),
  ]);
});

test('checks only the top level of the inputSchema, which is what the API checks', () => {
  const inputSchema: JsonSchema = {
    type: 'object',
    properties: {
      filter: { type: 'object', properties: { 'tags[]': { type: 'array' } } },
    },
    $defs: { page: { type: 'object', properties: { 'size[]': { type: 'integer' } } } },
  };
  const outputSchema: JsonSchema = { type: 'object', properties: { 'items[]': { type: 'array' } } };
  expect(run(paramName, { tools: [{ name: 'search', inputSchema, outputSchema }] })).toEqual([]);
});

test('leaves properties that aren’t an object to schema-object', () => {
  expect(
    run(paramName, {
      tools: [{ name: 'search', inputSchema: { type: 'object', properties: [] } }],
    }),
  ).toEqual([]);
});
