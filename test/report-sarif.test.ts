import { expect, test } from 'vitest';

import type { LintResult } from '../src/lint.js';
import { formatSarif, type SarifLog } from '../src/report/sarif.js';
import { rules } from '../src/rules/index.js';
import type { Problem, Snapshot } from '../src/types.js';
import { VERSION } from '../src/version.js';
import { snapshotOf } from './helpers.js';

const result = (...problems: Problem[]): LintResult => ({
  problems,
  errorCount: problems.filter((problem) => problem.severity === 'error').length,
  warningCount: problems.filter((problem) => problem.severity === 'warning').length,
});

// The log's one run: onmcp checks one server at a time.
const sarif = (lint: LintResult, snapshot: Snapshot = snapshotOf({}), file?: string) => {
  const output = formatSarif(
    lint,
    snapshot,
    file ? { file: { uri: 'tools.json', text: file } } : {},
  );
  expect(output.endsWith('}\n')).toBe(true);
  const log = JSON.parse(output) as SarifLog;
  expect(log.runs).toHaveLength(1);
  return { log, run: log.runs[0] as SarifLog['runs'][number] };
};

const noDescription: Problem = {
  rule: 'tool-description',
  severity: 'error',
  target: { kind: 'tool', name: 'sync', path: 'description' },
  message: 'The tool has no description.',
  fix: 'Say what the tool does and when to call it, in a sentence or two.',
};

test('writes a SARIF 2.1.0 log, with onmcp and every rule it has, linked to its docs', () => {
  const { log, run } = sarif(result());
  expect(log.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
  expect(log.version).toBe('2.1.0');
  const { driver } = run.tool;
  expect(driver).toMatchObject({
    name: 'onmcp',
    version: VERSION,
    informationUri: 'https://github.com/dgesteves/onmcp',
  });
  expect(driver.rules).toHaveLength(rules.length);
  expect(driver.rules[0]).toEqual({
    id: 'tool-description',
    shortDescription: { text: 'Every tool has a description.' },
    helpUri: 'https://github.com/dgesteves/onmcp/blob/main/docs/rules/tool-description.md',
    defaultConfiguration: { level: 'error' },
  });
  expect(run.results).toEqual([]);
});

test('writes each problem as a result, with its fix in the message and where it is', () => {
  expect(sarif(result(noDescription)).run.results).toEqual([
    {
      ruleId: 'tool-description',
      ruleIndex: 0,
      level: 'error',
      message: {
        text: 'The tool has no description. Say what the tool does and when to call it, in a sentence or two.',
      },
      locations: [
        {
          logicalLocations: [
            { name: 'sync', fullyQualifiedName: 'tool/sync/description', kind: 'function' },
          ],
        },
      ],
    },
  ]);
});

test('names the server, prompts, resources and templates in their logical locations', () => {
  const at = (problem: Partial<Problem>, snapshot?: Snapshot) =>
    sarif(result({ ...noDescription, ...problem }), snapshot).run.results[0]?.locations[0]
      ?.logicalLocations[0];
  expect(at({ target: { kind: 'server', path: 'instructions' } })).toEqual({
    name: 'server',
    fullyQualifiedName: 'server/instructions',
    kind: 'module',
  });
  expect(
    at({ target: { kind: 'server' } }, snapshotOf({ server: { name: 'docs', version: '1.0.0' } })),
  ).toMatchObject({ name: 'docs', fullyQualifiedName: 'server' });
  expect(at({ target: { kind: 'prompt', name: 'summarize' } })).toEqual({
    name: 'summarize',
    fullyQualifiedName: 'prompt/summarize',
    kind: 'function',
  });
  expect(at({ target: { kind: 'resource', uri: 'docs://index', path: 'uri' } })).toEqual({
    name: 'docs://index',
    fullyQualifiedName: 'resource/docs://index/uri',
    kind: 'resource',
  });
  expect(
    at({ target: { kind: 'resource-template', uriTemplate: 'file:///{path}', path: 'name' } }),
  ).toEqual({
    name: 'file:///{path}',
    fullyQualifiedName: 'resource-template/file:///{path}/name',
    kind: 'resource',
  });
});

test('leaves out a result’s ruleIndex for a rule it wasn’t given', () => {
  const [found] = sarif(result({ ...noDescription, rule: 'custom-rule' })).run.results;
  expect(found).not.toHaveProperty('ruleIndex');
  expect(found?.ruleId).toBe('custom-rule');
});

const file = `{
  "server": { "name": "sync", "version": "1.0.0" },
  "tools": [
    { "name": "search", "description": "Searches." },
    {
      "name": "sync"
    }
  ],
  "prompts": [{ "name": "sync" }],
  "resources": [{ "uri": "docs://index", "name": "index" }],
  "instructions": "Search first.",
  "resourceTemplates": [{ "uriTemplate": "docs://index", "name": "index" }]
}
`;

test.each<[Problem['target'], number]>([
  [{ kind: 'tool', name: 'sync', path: 'description' }, 6],
  [{ kind: 'prompt', name: 'sync' }, 9],
  [{ kind: 'resource', uri: 'docs://index' }, 10],
  [{ kind: 'server', path: 'instructions' }, 11],
  [{ kind: 'resource-template', uriTemplate: 'docs://index' }, 12],
  [{ kind: 'server', path: 'server.name' }, 1],
  [{ kind: 'tool', name: 'missing' }, 1],
])('points a result on %j at line %i of the file it was checked from', (target, line) => {
  const [found] = sarif(result({ ...noDescription, target }), snapshotOf({}), file).run.results;
  expect(found?.locations[0]?.physicalLocation).toEqual({
    artifactLocation: { uri: 'tools.json' },
    region: { startLine: line },
  });
});
