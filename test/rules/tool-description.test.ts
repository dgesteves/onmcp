import { expect, test } from 'vitest';

import { toolDescription } from '../../src/rules/tool-description.js';
import { run } from '../helpers.js';

const inputSchema = { type: 'object' };

test('passes a tool with a description', () => {
  expect(
    run(toolDescription, { tools: [{ name: 'search', description: 'Searches.', inputSchema }] }),
  ).toEqual([]);
});

test('reports a tool with no description', () => {
  expect(run(toolDescription, { tools: [{ name: 'search', inputSchema }] })).toEqual([
    {
      rule: 'tool-description',
      severity: 'error',
      target: { kind: 'tool', name: 'search', path: 'description' },
      message: 'The tool has no description.',
      fix: 'Say what the tool does and when to call it, in a sentence or two.',
    },
  ]);
});

test('reports a description that is only whitespace', () => {
  const [problem] = run(toolDescription, {
    tools: [{ name: 'search', description: ' \n ', inputSchema }],
  });
  expect(problem?.message).toBe('The description is empty.');
});
