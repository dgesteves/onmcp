import { expect, test } from 'vitest';

import { resourceDescription } from '../../src/rules/resource-description.js';
import { run } from '../helpers.js';

test('passes a resource with a description', () => {
  expect(
    run(resourceDescription, {
      resources: [{ uri: 'docs://index', name: 'index', description: 'Every page, by section.' }],
    }),
  ).toEqual([]);
});

test('reports a resource with no description', () => {
  expect(
    run(resourceDescription, {
      resources: [{ uri: 'docs://index', name: 'index', mimeType: 'text/markdown' }],
    }),
  ).toEqual([
    {
      rule: 'resource-description',
      severity: 'warning',
      target: { kind: 'resource', uri: 'docs://index', path: 'description' },
      message: 'The resource has no description.',
      fix: 'Say what the resource holds and when it’s worth reading, in a sentence or two.',
    },
  ]);
});

test('reports a description that is only whitespace', () => {
  const [problem] = run(resourceDescription, {
    resources: [{ uri: 'docs://index', name: 'index', description: '\t ' }],
  });
  expect(problem?.message).toBe('The description is empty.');
});

test('reports each resource with none, in the order the server lists them', () => {
  const problems = run(resourceDescription, {
    resources: [
      { uri: 'file:///b.md', name: 'b' },
      { uri: 'file:///a.md', name: 'a', description: 'The changelog.' },
      { uri: 'file:///c.md', name: 'c' },
    ],
  });
  expect(problems.map(({ target }) => target.kind === 'resource' && target.uri)).toEqual([
    'file:///b.md',
    'file:///c.md',
  ]);
});

test('doesn’t check tools or prompts', () => {
  expect(
    run(resourceDescription, {
      tools: [{ name: 'search', inputSchema: { type: 'object' } }],
      prompts: [{ name: 'review' }],
    }),
  ).toEqual([]);
});
