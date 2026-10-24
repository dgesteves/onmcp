import type { LintResult } from '../lint.js';
import type { Problem, Snapshot } from '../types.js';
import { VERSION } from '../version.js';

/** What `--format json` prints: one object, for scripts and CI. */
export interface JsonReport {
  /** The version of onmcp that checked it. */
  onmcp: string;
  server?: Snapshot['server'];
  /** How many of each the server lists: the problems are on these. */
  checked: { tools: number; prompts: number; resources: number; resourceTemplates: number };
  errorCount: number;
  warningCount: number;
  /** In rule order, as lint() returns them. */
  problems: Problem[];
}

/** Formats a lint result as JSON, for a script or a CI step to read. */
export function formatJson(result: LintResult, snapshot: Snapshot): string {
  return `${JSON.stringify(jsonReport(result, snapshot), null, 2)}\n`;
}

/** The object --format json prints, which the MCP server's tools return too. */
export function jsonReport(result: LintResult, snapshot: Snapshot): JsonReport {
  return {
    onmcp: VERSION,
    ...(snapshot.server && { server: snapshot.server }),
    checked: {
      tools: snapshot.tools.length,
      prompts: snapshot.prompts.length,
      resources: snapshot.resources.length,
      resourceTemplates: snapshot.resourceTemplates.length,
    },
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    problems: result.problems,
  };
}
