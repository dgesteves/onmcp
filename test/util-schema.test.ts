import { expect, test } from 'vitest';

import { closest } from '../src/util/closest.js';
import { resolveRef, walk } from '../src/util/schema.js';

test('walk visits every schema, depth first, with its path and depth', () => {
  const schema = {
    type: 'object',
    properties: {
      filter: { type: 'object', properties: { tag: { type: 'string' } } },
      ids: { type: 'array', items: { type: 'integer' } },
    },
    anyOf: [{ required: ['filter'] }, { required: ['ids'] }],
    $defs: { tag: { type: 'string' } },
    additionalProperties: false,
  };
  expect([...walk(schema, 'inputSchema')].map(({ path, depth }) => [path, depth])).toEqual([
    ['inputSchema', 0],
    ['inputSchema.properties.filter', 1],
    ['inputSchema.properties.filter.properties.tag', 2],
    ['inputSchema.properties.ids', 1],
    ['inputSchema.properties.ids.items', 2],
    ['inputSchema.anyOf.0', 1],
    ['inputSchema.anyOf.1', 1],
    ['inputSchema.$defs.tag', 1],
  ]);
});

test('walk takes tuple items, and skips values that aren’t schemas', () => {
  const schema = { items: [{ type: 'string' }, true], properties: { a: 'string' }, not: null };
  expect([...walk(schema, 's')].map(({ path }) => path)).toEqual(['s', 's.items.0']);
});

test('walk stops 64 schemas down', () => {
  let schema: Record<string, unknown> = { type: 'string' };
  for (let i = 0; i < 1000; i++) schema = { type: 'array', items: schema };
  const nodes = [...walk(schema, 's')];
  expect(nodes).toHaveLength(65);
  expect(nodes.at(-1)?.depth).toBe(64);
});

test('closest finds a typo, a swap and a case change, and not an unrelated word', () => {
  expect(closest('qeury', ['limit', 'query'])).toBe('query');
  expect(closest('quer', ['limit', 'query'])).toBe('query');
  expect(closest('Query', ['query'])).toBe('query');
  expect(closest('id', ['url', 'path'])).toBeUndefined();
  expect(closest('anything', [])).toBeUndefined();
});

test('resolveRef follows a local JSON Pointer, and nothing else', () => {
  const root = {
    $defs: { tag: { type: 'string' }, 'a/b': { type: 'integer' } },
    definitions: { old: { type: 'boolean' } },
  };
  expect(resolveRef(root, '#/$defs/tag')).toEqual({ type: 'string' });
  expect(resolveRef(root, '#/$defs/a~1b')).toEqual({ type: 'integer' });
  expect(resolveRef(root, '#/definitions/old')).toEqual({ type: 'boolean' });
  expect(resolveRef(root, '#/$defs/missing')).toBeUndefined();
  expect(resolveRef(root, 'https://example.com/schema.json')).toBeUndefined();
  expect(resolveRef(root, '#/$defs/tag/type')).toBeUndefined();
  expect(resolveRef(root, '#/constructor')).toBeUndefined();
  expect(resolveRef(root, undefined)).toBeUndefined();
});
