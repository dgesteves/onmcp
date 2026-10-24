import { expect, test } from 'vitest';

import { uriTemplate } from '../../src/rules/uri-template.js';
import { run } from '../helpers.js';

const check = (...templates: string[]) =>
  run(uriTemplate, {
    resourceTemplates: templates.map((template) => ({ uriTemplate: template, name: 'page' })),
  });
const messages = (...templates: string[]) =>
  check(...templates).map((problem) => [problem.message, problem.fix]);

test('passes templates with their variables in braces', () => {
  expect(
    check(
      'file:///{path}',
      'git://diff/{base}...{head}',
      'search://docs{?q,limit}',
      'docs://{+path}',
      'docs://{repo-name}/{page}',
      'http://localhost:8080/{path}',
      'http://[::1]:3000/{path}',
      'odata://orders?$filter={filter}',
      'docs://index',
      'emoji://🦀/{name}',
    ),
  ).toEqual([]);
});

test('reports a "{" that doesn’t close, which the SDK can’t parse', () => {
  expect(check('file:///{path')).toEqual([
    {
      rule: 'uri-template',
      severity: 'error',
      target: { kind: 'resource-template', uriTemplate: 'file:///{path', path: 'uriTemplate' },
      message:
        'The URI template has a "{" that doesn’t close: the MCP SDK can’t parse it ("Unclosed template expression"), so a client can’t read anything from it.',
      fix: 'Close the variable with "}", as in {path}.',
    },
  ]);
  expect(messages('docs://{owner}/{repo{path')[0]?.[0]).toMatch(
    /^The URI template has a "\{" that doesn’t close:/,
  );
});

test('reports a "{" that closes only after the next one, as the variable the SDK reads', () => {
  expect(messages('docs://{owner}/{repo/{path}')).toEqual([
    [
      'The URI template has a "{" that doesn’t close before the next one: a client reads "{repo/{path}" as one variable, named "repo/{path".',
      'Close each variable with "}" before the next "{".',
    ],
  ]);
});

test('reports a "}" that no "{" opens', () => {
  expect(messages('docs://{owner}/repo}/{path}')).toEqual([
    [
      'The URI template has a "}" that no "{" opens: it stays in every URI, which can’t hold one.',
      'Take it out, or open the variable with "{".',
    ],
  ]);
});

test.each([
  ['users://:id/profile', ':id', 'id'],
  ['users://{org}/:user_id', ':user_id', 'user_id'],
  ['files://<path>', '<path>', 'path'],
  ['pages://[slug]', '[slug]', 'slug'],
])('reports %s, a placeholder in another syntax', (template, placeholder, name) => {
  expect(messages(template)).toEqual([
    [
      `The URI template has "${placeholder}", which a URI template reads as text: a client can’t fill in "${name}", and reads it as written.`,
      `Write it as {${name}}.`,
    ],
  ]);
});

test('reports each placeholder, and a brace with them', () => {
  expect(check('users://:org/:id/{tab').map((problem) => problem.message.slice(0, 40))).toEqual([
    'The URI template has a "{" that doesn’t ',
    'The URI template has ":org", which a URI',
    'The URI template has ":id", which a URI ',
  ]);
});

test('doesn’t check resources, which have no variables', () => {
  expect(run(uriTemplate, { resources: [{ uri: 'users://:id', name: 'user' }] })).toEqual([]);
});
