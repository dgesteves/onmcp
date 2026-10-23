import { expect, test } from 'vitest';

import { requiredProperties } from '../../src/rules/required-properties.js';
import type { Tool } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (tool: Partial<Tool>) =>
  run(requiredProperties, {
    tools: [{ name: 'search', description: 'A tool.', inputSchema: { type: 'object' }, ...tool }],
  });

test('passes required names that are in properties', () => {
  expect(
    check({
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'integer' } },
        required: ['query'],
      },
    }),
  ).toEqual([]);
});

test('reports a typo, and suggests the property it meant', () => {
  expect(
    check({
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'integer' } },
        required: ['qeury'],
      },
    }),
  ).toEqual([
    {
      rule: 'required-properties',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'inputSchema.required' },
      message:
        '"qeury" is required but isn’t in properties: the model must send an argument it has no schema for.',
      fix: 'Did you mean "query"? Rename it in required.',
    },
  ]);
});

test('says to add the property when no name is close', () => {
  const [problem] = check({
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['page'] },
  });
  expect(problem?.fix).toBe('Add "page" to properties, or take it out of required.');
});

test('checks nested objects and the outputSchema', () => {
  const problems = check({
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: { tag: { type: 'string' } },
          required: ['tags'],
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { results: { type: 'array' } },
      required: ['results', 'total'],
    },
  });
  expect(problems.map((problem) => [problem.target.path, problem.message])).toEqual([
    [
      'inputSchema.properties.filter.required',
      '"tags" is required but isn’t in properties: the model must send an argument it has no schema for.',
    ],
    [
      'outputSchema.required',
      '"total" is required but isn’t in properties: the tool’s own results can’t pass its output schema.',
    ],
  ]);
});

test('leaves schemas with no properties, and unreadable ones, to schema-object', () => {
  expect(check({ inputSchema: { type: 'object', required: ['query'] } })).toEqual([]);
  expect(check({ inputSchema: { type: 'object', properties: {}, required: 'query' } })).toEqual([]);
});

test('doesn’t take a property inherited from Object.prototype', () => {
  const [problem] = check({
    inputSchema: { type: 'object', properties: { query: {} }, required: ['toString'] },
  });
  expect(problem?.message).toMatch(/^"toString" is required/);
});
