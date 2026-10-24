import { expect, test } from 'vitest';

import { schemaValues } from '../../src/rules/schema-values.js';
import type { JsonSchema } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (properties: Record<string, JsonSchema>) =>
  run(schemaValues, {
    tools: [
      { name: 'search', description: 'A tool.', inputSchema: { type: 'object', properties } },
    ],
  });

test('passes values that fit the type', () => {
  expect(
    check({
      sort: { type: 'string', enum: ['newest', 'oldest'], default: 'newest' },
      limit: { type: 'integer', default: 10, examples: [5, 20] },
      ratio: { type: 'number', default: 1, examples: [0.5] },
      exact: { type: 'boolean', const: true },
      cursor: { type: ['string', 'null'], default: null },
      tags: { type: 'array', default: [], items: { type: 'string', enum: ['bug', 'docs'] } },
      filter: { type: 'object', default: {} },
    }),
  ).toEqual([]);
});

test('reports enum values of another type, with the values the type takes', () => {
  expect(check({ limit: { type: 'integer', enum: ['10', '20'] } })).toEqual([
    {
      rule: 'schema-values',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'inputSchema.properties.limit.enum' },
      message:
        '"limit" lists "10" and "20" in its enum, but its type is "integer": no value passes both, so the model can’t send them.',
      fix: 'Write "10" and "20" as 10 and 20.',
    },
  ]);
});

test('reports only the enum values that don’t fit, up to four by name', () => {
  const [four] = check({ size: { type: 'string', enum: ['s', 1, 2, 3, 4, 'xl'] } });
  expect(four?.message).toBe(
    '"size" lists 1, 2, 3 and 4 in its enum, but its type is "string": no value passes both, so the model can’t send them.',
  );
  expect(four?.fix).toBe('Write 1, 2, 3 and 4 as "1", "2", "3" and "4".');

  const [five] = check({ size: { type: 'string', enum: [1, 2, 3, 4, 5] } });
  expect(five?.message).toMatch(/^"size" lists 1, 2, 3 and 2 more in its enum/);
  expect(five?.fix).toBe('Write 1, 2, 3 and 2 more as "1", "2", "3" and 2 more.');
});

test('reports a const, a default and examples of another type', () => {
  const problems = check({
    mode: { type: 'integer', const: '1' },
    exact: { type: 'boolean', default: 'false' },
    since: { type: 'string', examples: ['2026-10-01', 20261001] },
  });
  expect(problems.map(({ target, message, fix }) => [target.path, message, fix])).toEqual([
    [
      'inputSchema.properties.mode.const',
      '"mode" has const "1", but its type is "integer": no value passes both, so the model can’t send one.',
      'Write "1" as 1.',
    ],
    [
      'inputSchema.properties.exact.default',
      '"exact" defaults to "false", but its type is "boolean": a model that sends the default fails validation.',
      'Write "false" as false.',
    ],
    [
      'inputSchema.properties.since.examples',
      '"since" has the example 20261001, but its type is "string": a model that follows it fails validation.',
      'Write 20261001 as "20261001".',
    ],
  ]);
});

test('tells integers from numbers', () => {
  const problems = check({
    page: { type: 'integer', default: 1.5 },
    ratio: { type: 'number', default: 2 },
  });
  expect(problems.map((problem) => problem.target.path)).toEqual([
    'inputSchema.properties.page.default',
  ]);
  expect(problems[0]?.fix).toBe('Change it to fit the type, or the type to fit it.');
});

test('reports an empty enum, whatever the type', () => {
  expect(check({ sort: { enum: [] } })).toEqual([
    {
      rule: 'schema-values',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'inputSchema.properties.sort.enum' },
      message: '"sort" has an empty enum: no value passes it, so the model can’t send one.',
      fix: 'List the values it takes, or take out the enum.',
    },
  ]);
});

test('checks every depth, naming a schema that isn’t a property by its path', () => {
  const problems = check({
    tags: { type: 'array', items: { type: 'string', enum: ['bug', 2] } },
    filter: {
      type: 'object',
      properties: { since: { type: 'string', default: 0 } },
    },
  });
  expect(problems.map(({ target, message }) => [target.path, message])).toEqual([
    [
      'inputSchema.properties.tags.items.enum',
      'inputSchema.properties.tags.items lists 2 in its enum, but its type is "string": no value passes both, so the model can’t send it.',
    ],
    [
      'inputSchema.properties.filter.properties.since.default',
      '"since" defaults to 0, but its type is "string": a model that sends the default fails validation.',
    ],
  ]);
});

test('takes either type of a list of types', () => {
  expect(check({ limit: { type: ['integer', 'null'], enum: [10, null] } })).toEqual([]);
  const [problem] = check({ limit: { type: ['integer', 'null'], default: '10' } });
  expect(problem?.message).toBe(
    '"limit" defaults to "10", but its type is ["integer","null"]: a model that sends the default fails validation.',
  );
  expect(problem?.fix).toBe('Write "10" as 10.');
});

test('leaves alone a schema with no type, or a type JSON Schema doesn’t have', () => {
  expect(
    check({
      any: { enum: ['a', 1, null], default: 'a' },
      odd: { type: 'int', default: '10' },
      // How pydantic writes Optional[str] = None: the default is on the anyOf, which has no type.
      title: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
    }),
  ).toEqual([]);
});

test('doesn’t check the outputSchema', () => {
  expect(
    run(schemaValues, {
      tools: [
        {
          name: 'search',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            properties: { total: { type: 'integer', default: '0' } },
          },
        },
      ],
    }),
  ).toEqual([]);
});
