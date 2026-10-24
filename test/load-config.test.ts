import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { ConfigError } from '../src/lint.js';
import { findConfig, readConfig } from '../src/load/config.js';

/** Writes the text to a config file in a new folder, and returns the file's path. */
function configFile(text: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'onmcp-')), 'onmcp.config.json');
  writeFileSync(file, text);
  return file;
}

describe('readConfig', () => {
  test('reads the rules, and lets $schema be', async () => {
    const file = configFile(
      JSON.stringify({ $schema: './schema.json', rules: { 'tool-name': 'warning' } }),
    );
    expect(await readConfig(file)).toEqual({ rules: { 'tool-name': 'warning' } });
  });

  test('reads a config with no rules as the defaults', async () => {
    expect(await readConfig(configFile('{}'))).toEqual({});
  });

  test.each([
    ['{ "rules": ', /isn't JSON/],
    ['[]', /expected an object, such as \{ "rules": \{\} \}\.$/],
    ['{ "rule": { "tool-name": "off" } }', /unknown key "rule": a config takes "rules"\.$/],
    ['{ "rules": ["tool-name"] }', /"rules" maps each rule's name to its setting\.$/],
  ])('says what’s wrong with %s, and where', async (text, message) => {
    const file = configFile(text);
    const error = await readConfig(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message.startsWith(file)).toBe(true);
  });
});

describe('findConfig', () => {
  test('finds onmcp.config.json in the folder', () => {
    const file = configFile('{}');
    expect(findConfig(join(file, '..'))).toBe(file);
  });

  test('finds nothing in a folder without one', () => {
    expect(findConfig(mkdtempSync(join(tmpdir(), 'onmcp-')))).toBeUndefined();
  });
});
