import { expect, test } from 'vitest';

import { schemaObject } from '../../src/rules/schema-object.js';
import type { Tool } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (tool: Partial<Tool>) =>
  run(schemaObject, {
    tools: [{ name: 'search', description: 'A tool.', inputSchema: { type: 'object' }, ...tool }],
  });

test('passes object schemas, with or without properties', () => {
  expect(check({})).toEqual([]);
  expect(
    check({
      inputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
    }),
  ).toEqual([]);
});

test('reports an inputSchema with no type', () => {
  expect(check({ inputSchema: { properties: { query: { type: 'string' } } } })).toEqual([
    {
      rule: 'schema-object',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'inputSchema.type' },
      message:
        'inputSchema has no "type": MCP requires "object", and hosts that check it drop the tool.',
      fix: 'Add "type": "object".',
    },
  ]);
});

test('reports another type, and a nullable object', () => {
  expect(check({ inputSchema: { type: 'string' } })[0]?.message).toBe(
    'inputSchema’s type is "string": MCP requires "object", since a tool’s arguments are named.',
  );
  expect(check({ inputSchema: { type: ['object', 'null'] } })[0]?.message).toMatch(
    /^inputSchema’s type is \["object","null"\]:/,
  );
});

test('checks an outputSchema the same way', () => {
  const [problem] = check({ outputSchema: { type: 'array', items: { type: 'string' } } });
  expect(problem?.target.path).toBe('outputSchema.type');
  expect(problem?.message).toMatch(/since structured content is a JSON object\.$/);
  expect(problem?.fix).toBe('Make it "object", and put the result in a named property.');
});

test('reports properties that aren’t an object, and required that isn’t names', () => {
  const problems = check({
    inputSchema: { type: 'object', properties: [{ name: 'query' }], required: 'query' },
  });
  expect(problems.map((problem) => [problem.target.path, problem.message])).toEqual([
    [
      'inputSchema.properties',
      'inputSchema.properties is an array: JSON Schema needs an object that maps each name to its schema.',
    ],
    [
      'inputSchema.required',
      'inputSchema.required is string "query": JSON Schema needs an array of property names.',
    ],
  ]);
  expect(check({ inputSchema: { type: 'object', required: [1] } })[0]?.message).toMatch(
    /^inputSchema.required is an array:/,
  );
});
