// Writes schema.json, the JSON Schema of onmcp.config.json, from the rules in dist/: the build runs
// it after tsdown. test/config-schema.test.ts fails when the committed file is out of date.
import { writeFileSync } from 'node:fs';

import { configSchema, rules } from '../dist/index.js';

writeFileSync(
  new URL('../schema.json', import.meta.url),
  `${JSON.stringify(configSchema(rules), null, 2)}\n`,
);
