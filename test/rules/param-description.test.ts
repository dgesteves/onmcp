import { expect, test } from 'vitest';

import { paramDescription } from '../../src/rules/param-description.js';
import type { JsonSchema } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (inputSchema: JsonSchema) =>
  run(paramDescription, { tools: [{ name: 'search', description: 'A tool.', inputSchema }] });

test('passes arguments that each have a description', () => {
  expect(
    check({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in plain words.' },
        limit: { type: 'integer', description: 'At most this many results, 1 to 20.' },
      },
    }),
  ).toEqual([]);
});

test('reports an argument with no description', () => {
  expect(
    check({
      type: 'object',
      properties: { q: { type: 'string' }, limit: { type: 'integer', description: 'Max.' } },
    }),
  ).toEqual([
    {
      rule: 'param-description',
      severity: 'warning',
      target: { kind: 'tool', name: 'search', path: 'inputSchema.properties.q' },
      message: '"q" has no description: the model fills it in from its name alone.',
      fix: 'Say what "q" is, in what format, with an example value.',
    },
  ]);
});

test('reports an empty description, and nested properties, with their paths', () => {
  const problems = check({
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        description: 'Narrows the results.',
        properties: { tag: { type: 'string' }, since: { type: 'string', description: ' ' } },
      },
    },
  });
  expect(problems.map((problem) => problem.target.path)).toEqual([
    'inputSchema.properties.filter.properties.tag',
    'inputSchema.properties.filter.properties.since',
  ]);
});

test('takes the description of the local schema a $ref points to', () => {
  const schema = {
    type: 'object',
    properties: { tag: { $ref: '#/$defs/tag' }, label: { $ref: '#/$defs/label' } },
    $defs: {
      tag: { type: 'string', description: 'A tag, such as "bug".' },
      label: { type: 'string' },
    },
  };
  expect(check(schema).map((problem) => problem.target.path)).toEqual([
    'inputSchema.properties.label',
  ]);
});

test('doesn’t check the outputSchema', () => {
  expect(
    run(paramDescription, {
      tools: [
        {
          name: 'search',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        },
      ],
    }),
  ).toEqual([]);
});
