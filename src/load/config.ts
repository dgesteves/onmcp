import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ConfigError } from '../lint.js';
import type { Config } from '../types.js';

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
