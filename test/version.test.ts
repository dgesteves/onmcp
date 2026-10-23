import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { VERSION } from '../src/index.js';

test('VERSION is the version in package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  expect(VERSION).toBe(pkg.version);
});
