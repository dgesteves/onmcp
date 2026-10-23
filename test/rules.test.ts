import { existsSync, readdirSync, readFileSync } from 'node:fs';

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

  test('the README lists every rule, in order, with its severity and description', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const table = /<!-- rules:start -->([\s\S]*)<!-- rules:end -->/.exec(readme)?.[1] ?? '';
    const rows = table
      .split('\n')
      .filter((line) => line.startsWith('| [`'))
      .map((line) => line.split('|').map((cell) => cell.trim()));
    expect(rows.map(([, rule, severity, catches]) => [rule, severity, catches])).toEqual(
      rules.map((rule) => [
        `[\`${rule.name}\`](docs/rules/${rule.name}.md)`,
        rule.severity,
        rule.description,
      ]),
    );
  });
});
