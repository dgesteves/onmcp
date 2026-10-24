import { expect, test } from 'vitest';

import type { LintResult } from '../src/lint.js';
import { formatGithub } from '../src/report/github.js';
import type { Problem } from '../src/types.js';

const result = (...problems: Problem[]): LintResult => ({
  problems,
  errorCount: problems.filter((problem) => problem.severity === 'error').length,
  warningCount: problems.filter((problem) => problem.severity === 'warning').length,
});

const noDescription: Problem = {
  rule: 'tool-description',
  severity: 'error',
  target: { kind: 'tool', name: 'sync', path: 'description' },
  message: 'The tool has no description.',
  fix: 'Say what the tool does and when to call it, in a sentence or two.',
};

test('writes a workflow command for each problem, titled with its rule and target', () => {
  const output = formatGithub(
    result(noDescription, {
      rule: 'context-budget',
      severity: 'warning',
      target: { kind: 'server' },
      message: 'The server’s tools are about 12,000 tokens.',
    }),
  );
  expect(output).toBe(
    [
      '::error title=tool-description%3A tool sync::The tool has no description. Say what the tool does and when to call it, in a sentence or two.',
      '::warning title=context-budget%3A server::The server’s tools are about 12,000 tokens.',
      '',
    ].join('\n'),
  );
});

test('writes nothing when there are no problems', () => {
  expect(formatGithub(result())).toBe('');
});

test('puts each annotation on the line of the file where its target is', () => {
  const text = '{\n  "tools": [\n    { "name": "search" },\n    { "name": "sync" }\n  ]\n}\n';
  expect(formatGithub(result(noDescription), { file: { path: 'mcp/tools.json', text } })).toMatch(
    /^::error file=mcp\/tools\.json,line=4,title=tool-description%3A tool sync::/,
  );
});

test('escapes what a server wrote, so it can’t start a workflow command of its own', () => {
  const output = formatGithub(
    result({
      ...noDescription,
      target: { kind: 'tool', name: 'a,b:c\n::warning::injected' },
      message: '100% sure,\r\n::add-mask::secret',
    }),
    { file: { path: 'tools, v2.json', text: '' } },
  );
  expect(output.split('\n')).toEqual([
    '::error file=tools%2C v2.json,line=1,title=tool-description%3A tool a%2Cb%3Ac%0A%3A%3Awarning%3A%3Ainjected::100%25 sure,%0D%0A::add-mask::secret Say what the tool does and when to call it, in a sentence or two.',
    '',
  ]);
});
