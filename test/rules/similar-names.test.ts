import { expect, test } from 'vitest';

import { similarNames } from '../../src/rules/similar-names.js';
import { run } from '../helpers.js';

const check = (...names: string[]) =>
  run(similarNames, {
    tools: names.map((name) => ({
      name,
      description: 'Does it.',
      inputSchema: { type: 'object' },
    })),
  });

test.each([
  ['get_user', 'list_users'],
  ['get_file', 'set_file'],
  ['read_file', 'write_file'],
  ['search', 'search_news'],
  ['search', 'search_issues'],
  ['get_address', 'get_addresses_by_city'],
  ['search', 'search'],
])('passes %s and %s', (...names) => {
  expect(check(...names)).toEqual([]);
});

test('reports names that differ only in case and separators, on the second', () => {
  expect(check('get_user', 'getUser')).toEqual([
    {
      rule: 'similar-names',
      severity: 'warning',
      target: { kind: 'tool', name: 'getUser', path: 'name' },
      message:
        '"getUser" and "get_user" differ only in case and separators: a model picks a tool by its name first, and can call one for the other.',
      fix: 'Name each for what sets it apart, such as get_user and list_users. If one replaces the other, remove the old one.',
    },
  ]);
});

test.each([
  ['get_user', 'get-user', 'case and separators'],
  ['search', 'Search', 'case and separators'],
  ['getuser', 'GET_USER', 'case and separators'],
  ['get_user', 'get_users', 'a plural'],
  ['list_entry', 'list_entries', 'a plural'],
  ['search', 'search_v2', 'a version'],
  ['search', 'searchV2', 'a version'],
  ['fetch_page', 'fetch_page_legacy', 'a version'],
  ['get_issue', 'get_issues_new', 'a version'],
])('reports %s and %s: they differ only in %s', (first, second, how) => {
  expect(check(first, second)[0]?.message).toContain(
    `"${second}" and "${first}" differ only in ${how}:`,
  );
});

test('reports each tool once, against the first name it’s like', () => {
  const problems = check('search', 'Search', 'search_v2', 'fetch');
  expect(problems.map((problem) => problem.message.split(':')[0])).toEqual([
    '"Search" and "search" differ only in case and separators',
    '"search_v2" and "search" differ only in a version',
  ]);
});
