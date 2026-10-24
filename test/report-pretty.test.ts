import { expect, test } from 'vitest';

import type { LintResult } from '../src/lint.js';
import { formatPretty } from '../src/report/pretty.js';
import type { Problem } from '../src/types.js';
import { snapshotOf } from './helpers.js';

const inputSchema = { type: 'object' };
const snapshot = snapshotOf({
  tools: [
    { name: 'search', inputSchema },
    { name: 'fetch', inputSchema },
  ],
  prompts: [{ name: 'summarize' }],
});

const result = (problems: Problem[]): LintResult => {
  const errorCount = problems.filter((problem) => problem.severity === 'error').length;
  return { problems, errorCount, warningCount: problems.length - errorCount };
};

test('groups problems by what they are on, in the order the server lists them', () => {
  const output = formatPretty(
    result([
      {
        rule: 'prompt-argument-description',
        severity: 'warning',
        target: { kind: 'prompt', name: 'summarize', path: 'arguments.0' },
        message: '"path" has no description.',
      },
      {
        rule: 'tool-description',
        severity: 'error',
        target: { kind: 'tool', name: 'fetch' },
        message: 'The tool has no description.',
        fix: 'Say what the tool does.',
      },
      {
        rule: 'tool-description',
        severity: 'error',
        target: { kind: 'tool', name: 'search' },
        message: 'The tool has no description.',
      },
    ]),
    snapshot,
  );
  expect(output).toBe(
    [
      '',
      '  tool search',
      '  ✖ tool-description             The tool has no description.',
      '',
      '  tool fetch',
      '  ✖ tool-description             The tool has no description.',
      '                                 → Say what the tool does.',
      '',
      '  prompt summarize',
      '  ⚠ prompt-argument-description  "path" has no description.',
      '',
      '✖ 3 problems (2 errors, 1 warning) in 2 tools, 1 prompt',
      '',
    ].join('\n'),
  );
});

test('says so when there are no problems', () => {
  expect(formatPretty(result([]), snapshot)).toBe('✔ No problems in 2 tools, 1 prompt\n');
});

test('shows only warnings with the warning symbol', () => {
  const output = formatPretty(
    result([
      {
        rule: 'a',
        severity: 'warning',
        target: { kind: 'server' },
        message: 'Long instructions.',
      },
    ]),
    snapshotOf({}),
  );
  expect(output).toBe(
    '\n  server\n  ⚠ a  Long instructions.\n\n⚠ 1 problem (0 errors, 1 warning) in 0 tools\n',
  );
});

test('colors only when asked to', () => {
  const problems = result([
    { rule: 'a', severity: 'error', target: { kind: 'server' }, message: 'm' },
  ]);
  expect(formatPretty(problems, snapshot)).not.toContain('\u001b[');
  expect(formatPretty(problems, snapshot, { color: true })).toContain('\u001b[31m✖');
});

test('shows what a server wrote, and passes nothing on to the terminal', () => {
  const name = 'evil\u001b[2J\n::warning::injected';
  const output = formatPretty(
    result([
      {
        rule: 'a',
        severity: 'error',
        target: { kind: 'tool', name },
        message: `The name "${name}" is bad.`,
        fix: 'Rename\u009b31m it.',
      },
    ]),
    snapshotOf({ tools: [{ name, inputSchema }] }),
  );
  expect(output).not.toContain('\u001b');
  expect(output).not.toContain('\u009b');
  expect(output.split('\n').filter((line) => line.startsWith('::'))).toEqual([]);
  expect(output).toContain('  tool evil<U+001B>[2J<U+000A>::warning::injected\n');
  expect(output).toContain('→ Rename<U+009B>31m it.');
});

test('groups resource templates after the resources, and counts them', () => {
  const output = formatPretty(
    result([
      {
        rule: 'resource-description',
        severity: 'warning',
        target: { kind: 'resource-template', uriTemplate: 'git://diff/{base}...{head}' },
        message: 'The template has no description.',
      },
      {
        rule: 'resource-description',
        severity: 'warning',
        target: { kind: 'resource', uri: 'file:///README.md' },
        message: 'The resource has no description.',
      },
    ]),
    snapshotOf({
      resources: [{ uri: 'file:///README.md', name: 'readme' }],
      resourceTemplates: [
        { uriTemplate: 'file:///{path}', name: 'file' },
        { uriTemplate: 'git://diff/{base}...{head}', name: 'diff' },
      ],
    }),
  );
  expect(output).toBe(
    [
      '',
      '  resource file:///README.md',
      '  ⚠ resource-description  The resource has no description.',
      '',
      '  resource template git://diff/{base}...{head}',
      '  ⚠ resource-description  The template has no description.',
      '',
      '⚠ 2 problems (0 errors, 2 warnings) in 0 tools, 1 resource, 2 resource templates',
      '',
    ].join('\n'),
  );
});
