import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Ajv from 'ajv';
import { expect, test } from 'vitest';

import { configSchema, loadConfig } from '../src/load/config.js';
import { rules } from '../src/rules/index.js';

const schema = configSchema(rules);
const validate = new Ajv({ allErrors: true }).compile(schema);

test('schema.json is the schema the rules give: pnpm build writes it', () => {
  const committed = JSON.parse(
    readFileSync(new URL('../schema.json', import.meta.url), 'utf8'),
  ) as unknown;
  expect(committed).toEqual(schema);
});

const folder = mkdtempSync(join(tmpdir(), 'onmcp-schema-'));

/** Whether onmcp itself runs with the config, as the CLI and the MCP server read it. */
async function runs(config: unknown): Promise<boolean> {
  const file = join(folder, 'onmcp.config.json');
  writeFileSync(file, JSON.stringify(config));
  return loadConfig(file, rules).then(
    () => true,
    () => false,
  );
}

test.each<[string, unknown]>([
  ['no rules', {}],
  ['an editor’s $schema', { $schema: './node_modules/onmcp/schema.json', rules: {} }],
  [
    'the README’s example',
    {
      rules: {
        'param-description': 'off',
        'sensitive-paths': 'error',
        'description-budget': ['warning', { maxTokens: 300 }],
      },
    },
  ],
  ['a rule with no options, and none given', { rules: { 'tool-name': ['error', {}] } }],
])('takes %s, as onmcp does', async (_, config) => {
  expect(validate(config)).toBe(true);
  expect(await runs(config)).toBe(true);
});

test.each<[string, unknown]>([
  ['a rule onmcp doesn’t have', { rules: { 'param-descripton': 'off' } }],
  ['a severity it doesn’t have', { rules: { 'tool-name': 'warn' } }],
  ['a key onmcp doesn’t read', { rule: { 'tool-name': 'off' } }],
  ['an option a rule doesn’t take', { rules: { 'context-budget': ['error', { maxToken: 1 }] } }],
  ['an option of the wrong type', { rules: { 'context-budget': ['error', { maxTokens: '1' }] } }],
  ['options for a rule with none', { rules: { 'tool-name': ['error', { strict: true }] } }],
  ['"off" with options', { rules: { 'context-budget': ['off', { maxTokens: 1 }] } }],
  ['a severity with no options', { rules: { 'context-budget': ['error'] } }],
  ['rules that aren’t an object', { rules: ['tool-name'] }],
])('rejects %s, as onmcp does', async (_, config) => {
  expect(validate(config)).toBe(false);
  expect(await runs(config)).toBe(false);
});

test('describes each rule with what it catches and its default severity', () => {
  const properties = (schema.properties as { rules: { properties: Record<string, unknown> } }).rules
    .properties;
  expect(Object.keys(properties)).toEqual(rules.map((rule) => rule.name));
  expect(properties['context-budget']).toMatchObject({
    description:
      'The server’s instructions and tools fit in maxTokens (10,000 by default) of the model’s context. Default: warning.',
  });
});
