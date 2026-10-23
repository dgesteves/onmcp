import { existsSync, readdirSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { rules } from '../src/rules/index.js';

const docs = new URL('../docs/rules/', import.meta.url);
const tests = new URL('rules/', import.meta.url);

describe('the rules', () => {
  test('have unique kebab-case names', () => {
    const names = rules.map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  test.each(rules.map((rule) => rule.name))('%s has a docs page and tests', (name) => {
    expect(existsSync(new URL(`${name}.md`, docs))).toBe(true);
    expect(existsSync(new URL(`${name}.test.ts`, tests))).toBe(true);
  });

  test('every docs page is for a rule onmcp has', () => {
    const names = new Set(rules.map((rule) => rule.name));
    for (const file of readdirSync(docs)) expect(names).toContain(file.replace(/\.md$/, ''));
  });
});
