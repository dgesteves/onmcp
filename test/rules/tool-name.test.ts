import { expect, test } from 'vitest';

import { toolName } from '../../src/rules/tool-name.js';
import { run } from '../helpers.js';

const tool = (name: string) => ({ name, description: 'A tool.', inputSchema: { type: 'object' } });
const check = (...names: string[]) => run(toolName, { tools: names.map(tool) });

test('passes the names MCP allows', () => {
  expect(check('search_docs', 'get-page', 'docs.search', 'A1', 'x'.repeat(128))).toEqual([]);
});

test('reports a space, and suggests the name with "_"', () => {
  expect(check('search docs')).toEqual([
    {
      rule: 'tool-name',
      severity: 'error',
      target: { kind: 'tool', name: 'search docs', path: 'name' },
      message: 'The name has a space: MCP allows only ASCII letters, digits, "_", "-" and ".".',
      fix: 'Rename it "search_docs".',
    },
  ]);
});

test('names each character it doesn’t allow, once', () => {
  const [problem] = check('repos/list, all');
  expect(problem?.message).toMatch(/^The name has "\/", "," and a space:/);
  expect(problem?.fix).toBe('Rename it "repos_list_all".');
});

test('shows a character outside ASCII by its code point, and drops accents in the fix', () => {
  const [problem] = check('créer\u200bpage');
  expect(problem?.message).toMatch(/^The name has "é" \(U\+00E9\) and "\u200b" \(U\+200B\):/);
  expect(problem?.fix).toBe('Rename it "creer_page".');
});

test('reports a name over 128 characters', () => {
  const [problem] = check('x'.repeat(129));
  expect(problem?.message).toBe('The name is 129 characters, over MCP’s 128.');
});

test('reports an empty name', () => {
  expect(check('').map((problem) => problem.message)).toEqual(['The tool’s name is empty.']);
});
