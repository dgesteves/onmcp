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
