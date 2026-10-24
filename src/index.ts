export { ConfigError, lint, type LintResult } from './lint.js';
export { parseSnapshot, readSnapshot, SnapshotError } from './load/file.js';
export { formatJson, type JsonReport } from './report/json.js';
export { formatPretty, type PrettyOptions } from './report/pretty.js';
export { rules } from './rules/index.js';
export type * from './types.js';
export { VERSION } from './version.js';
