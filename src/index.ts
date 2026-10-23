import pkg from '../package.json' with { type: 'json' };

export { ConfigError, lint, type LintResult } from './lint.js';
export { parseSnapshot, readSnapshot, SnapshotError } from './load/file.js';
export { formatPretty, type PrettyOptions } from './report/pretty.js';
export { rules } from './rules/index.js';
export type * from './types.js';

/** The version of onmcp, as published. */
export const VERSION: string = pkg.version;
