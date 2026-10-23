import { expect, test } from 'vitest';

import { strings } from '../src/util/strings.js';

test('strings yields each string and key in a JSON value, with its path', () => {
  const value = { name: 'search', tags: ['a', 1, null], schema: { properties: { q: {} } } };
  expect([...strings(value, '')]).toEqual([
    ['name', 'name'],
    ['name', 'search'],
    ['tags', 'tags'],
    ['tags.0', 'a'],
    ['schema', 'schema'],
    ['schema.properties', 'properties'],
    ['schema.properties.q', 'q'],
  ]);
});

test('strings starts from the path it is given, and stops 64 down', () => {
  expect([...strings('x', 'root')]).toEqual([['root', 'x']]);
  let deep: unknown = 'bottom';
  for (let i = 0; i < 1000; i++) deep = [deep];
  expect([...strings(deep, '')]).toEqual([]);
});
