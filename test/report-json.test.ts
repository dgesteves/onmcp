import { expect, test } from 'vitest';

import { formatJson, type JsonReport } from '../src/report/json.js';
import { VERSION } from '../src/version.js';
import { snapshotOf } from './helpers.js';

const problem = {
  rule: 'tool-description',
  severity: 'error' as const,
  target: { kind: 'tool' as const, name: 'fetch' },
  message: 'The tool has no description.',
  fix: 'Say what the tool does.',
};

test('prints the counts and every problem, with what was checked, as one object', () => {
  const snapshot = snapshotOf({
    server: { name: 'docs', version: '2.1.0' },
    tools: [{ name: 'fetch', inputSchema: { type: 'object' } }],
    prompts: [{ name: 'summarize' }],
  });
  const output = formatJson({ problems: [problem], errorCount: 1, warningCount: 0 }, snapshot);
  expect(output.endsWith('}\n')).toBe(true);
  expect(JSON.parse(output)).toEqual({
    onmcp: VERSION,
    server: { name: 'docs', version: '2.1.0' },
    checked: { tools: 1, prompts: 1, resources: 0, resourceTemplates: 0 },
    errorCount: 1,
    warningCount: 0,
    problems: [problem],
  } satisfies JsonReport);
});

test('leaves the server out when the snapshot doesn’t say which it is', () => {
  const report = JSON.parse(
    formatJson({ problems: [], errorCount: 0, warningCount: 0 }, snapshotOf({})),
  ) as JsonReport;
  expect(report).not.toHaveProperty('server');
  expect(report.problems).toEqual([]);
});
