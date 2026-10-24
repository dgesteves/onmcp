import { expect, test } from 'vitest';

import { uniqueNames } from '../../src/rules/unique-names.js';
import { run } from '../helpers.js';

const tool = (name: string) => ({ name, description: 'A tool.', inputSchema: { type: 'object' } });

test('passes names that differ, even only in case', () => {
  expect(run(uniqueNames, { tools: [tool('search'), tool('Search'), tool('fetch')] })).toEqual([]);
});

test('reports each tool after the first with the same name', () => {
  expect(
    run(uniqueNames, { tools: [tool('search'), tool('fetch'), tool('search'), tool('search')] }),
  ).toEqual([
    {
      rule: 'unique-names',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'name' },
      message:
        'Tool 1 has this name too: a host keeps one of them, and the model can’t reach the other.',
      fix: 'Rename one of them.',
    },
    expect.objectContaining({ message: expect.stringMatching(/^Tool 1 has/) as unknown }),
  ]);
});

test('reports prompts with the same name', () => {
  const [problem] = run(uniqueNames, { prompts: [{ name: 'summarize' }, { name: 'summarize' }] });
  expect(problem?.target).toEqual({ kind: 'prompt', name: 'summarize', path: 'name' });
  expect(problem?.message).toMatch(/^Prompt 1 has this name too/);
});

test('reports resources with the same URI, and not with the same name', () => {
  const problems = run(uniqueNames, {
    resources: [
      { uri: 'docs://index', name: 'index' },
      { uri: 'docs://guide', name: 'index' },
      { uri: 'docs://index', name: 'home' },
    ],
  });
  expect(problems).toEqual([
    expect.objectContaining({
      target: { kind: 'resource', uri: 'docs://index', path: 'uri' },
      message:
        'Resource 1 has this URI too: a host keeps one of them, and the model can’t reach the other.',
      fix: 'Give each resource its own URI.',
    }),
  ]);
});

test('reports templates with the same URI template', () => {
  const problems = run(uniqueNames, {
    resources: [{ uri: 'docs://{page}', name: 'page' }],
    resourceTemplates: [
      { uriTemplate: 'docs://{page}', name: 'page' },
      { uriTemplate: 'docs://{section}/{page}', name: 'section' },
      { uriTemplate: 'docs://{page}', name: 'guide' },
    ],
  });
  // A resource whose URI is a template's text is a different thing, read by its exact URI.
  expect(problems).toEqual([
    expect.objectContaining({
      target: { kind: 'resource-template', uriTemplate: 'docs://{page}', path: 'uriTemplate' },
      message:
        'Template 1 has this URI template too: a URI that fits it reads one of them, and the other can’t be read at all.',
      fix: 'Give each template its own URI template.',
    }),
  ]);
});

test('a tool and a prompt may share a name', () => {
  expect(
    run(uniqueNames, { tools: [tool('summarize')], prompts: [{ name: 'summarize' }] }),
  ).toEqual([]);
});
