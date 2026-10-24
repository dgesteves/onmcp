import { expect, test } from 'vitest';

import { promptDescription } from '../../src/rules/prompt-description.js';
import type { PromptArgument } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (args: PromptArgument[]) =>
  run(promptDescription, {
    prompts: [{ name: 'review', description: 'Reviews a pull request.', arguments: args }],
  });

test('passes a prompt with a description, and arguments that each have one', () => {
  expect(
    check([
      { name: 'pr', description: 'The pull request’s number, such as 42.', required: true },
      { name: 'focus', description: 'What to look at most, such as "tests".' },
    ]),
  ).toEqual([]);
  expect(
    run(promptDescription, { prompts: [{ name: 'standup', description: 'A recap.' }] }),
  ).toEqual([]);
});

test('reports a prompt with no description', () => {
  expect(run(promptDescription, { prompts: [{ name: 'review' }] })).toEqual([
    {
      rule: 'prompt-description',
      severity: 'warning',
      target: { kind: 'prompt', name: 'review', path: 'description' },
      message: 'The prompt has no description.',
      fix: 'Say what the prompt does and when to use it, in a sentence or two.',
    },
  ]);
});

test('reports a description that is only whitespace', () => {
  const [problem] = run(promptDescription, { prompts: [{ name: 'review', description: ' \n ' }] });
  expect(problem?.message).toBe('The description is empty.');
});

test('reports an argument with no description, by its index', () => {
  expect(
    check([
      { name: 'pr', description: 'The pull request’s number, such as 42.' },
      { name: 'focus' },
    ]),
  ).toEqual([
    {
      rule: 'prompt-description',
      severity: 'warning',
      target: { kind: 'prompt', name: 'review', path: 'arguments.1' },
      message: '"focus" has no description: a person fills it in from its name alone.',
      fix: 'Say what "focus" is, with an example value.',
    },
  ]);
});

test('reports the prompt and each argument with an empty description, in order', () => {
  const problems = run(promptDescription, {
    prompts: [{ name: 'review', arguments: [{ name: 'pr', description: '' }, { name: 'focus' }] }],
  });
  expect(problems.map((problem) => problem.target.path)).toEqual([
    'description',
    'arguments.0',
    'arguments.1',
  ]);
});

test('doesn’t check tools or resources', () => {
  expect(
    run(promptDescription, {
      tools: [{ name: 'search', inputSchema: { type: 'object' } }],
      resources: [{ uri: 'docs://index', name: 'index' }],
    }),
  ).toEqual([]);
});
