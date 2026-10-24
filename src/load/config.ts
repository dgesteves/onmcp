import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ConfigError, configure } from '../lint.js';
import type { Config, Rule } from '../types.js';

/** The config onmcp reads from the folder it runs in, unless --config names another. */
export const CONFIG_FILE = 'onmcp.config.json';

// $schema is for editors, and onmcp ignores it.
const KEYS = ['$schema', 'rules'];

/** The config file in the folder, or undefined when it has none. */
export function findConfig(dir: string): string | undefined {
  const file = join(dir, CONFIG_FILE);
  return existsSync(file) ? file : undefined;
}

/**
 * Reads a config from a JSON file, such as `{ "rules": { "param-description": "off" } }`. lint()
 * checks each rule's setting when it runs it, against the rules it has.
 */
export async function readConfig(file: string): Promise<Config> {
  const text = await readFile(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${file} isn't JSON: ${(error as Error).message}`, { cause: error });
  }
  if (!isObject(json)) {
    throw new ConfigError(`${file}: expected an object, such as { "rules": {} }.`);
  }
  // A key onmcp doesn't read is most likely a typo, and ignoring it would ignore what it sets.
  for (const key of Object.keys(json)) {
    if (!KEYS.includes(key)) {
      throw new ConfigError(`${file}: unknown key "${key}": a config takes "rules".`);
    }
  }
  const { rules } = json;
  if (rules === undefined) return {};
  if (!isObject(rules)) {
    throw new ConfigError(`${file}: "rules" maps each rule's name to its setting.`);
  }
  return { rules: rules as Config['rules'] };
}

/**
 * Reads the config, if there is one, and checks it against the rules, before a server starts for
 * nothing. Its errors name the file.
 */
export async function loadConfig(
  file: string | undefined,
  rules: readonly Rule[],
): Promise<Config> {
  if (file === undefined) return {};
  const config = await readConfig(file);
  try {
    configure(rules, config);
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(`${file}: ${error.message}`);
    throw error;
  }
  return config;
}

/**
 * The JSON Schema of onmcp.config.json, for editors: each rule by name, with what it catches and
 * its default severity, and the options it takes. readConfig() and lint() check the same things
 * when onmcp runs; this lets an editor complete them, and mark a typo before then.
 */
export function configSchema(rules: readonly Rule[]): Record<string, unknown> {
  return {
    $id: 'https://unpkg.com/onmcp/schema.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'onmcp config',
    description: `${CONFIG_FILE}: which rules onmcp runs, at what severity, with what options.`,
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      rules: {
        description:
          'Each rule’s setting: "off", "warning" or "error", or [severity, options]. A rule the config leaves out runs at its default severity.',
        type: 'object',
        properties: Object.fromEntries(rules.map((rule) => [rule.name, setting(rule)])),
        additionalProperties: false,
      },
    },
    additionalProperties: false,
    definitions: { severity: { enum: ['warning', 'error'] } },
  };
}

// A rule's setting: off or a severity, or [severity, options] with only the options it takes, each
// of its default's type.
function setting(rule: Rule): Record<string, unknown> {
  const defaults: Record<string, unknown> = { ...rule.defaults };
  const options = Object.entries(defaults).map(([name, value]): [string, object] => {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    return [name, { type, default: value }];
  });
  return {
    description: `${rule.description} Default: ${rule.severity}.`,
    anyOf: [
      { enum: ['off', 'warning', 'error'] },
      {
        type: 'array',
        items: [
          { $ref: '#/definitions/severity' },
          { type: 'object', properties: Object.fromEntries(options), additionalProperties: false },
        ],
        minItems: 2,
        maxItems: 2,
      },
    ],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
