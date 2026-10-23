import { styleText } from 'node:util';

import type { LintResult } from '../lint.js';
import type { Problem, Snapshot, Target } from '../types.js';

export interface PrettyOptions {
  /** ANSI colors: the CLI turns them on for a terminal that isn't NO_COLOR. */
  color?: boolean;
}

/**
 * Formats a lint result for a person in a terminal: the problems grouped under the tool, prompt
 * or resource they're on, in the order the server lists them, each with its fix, then a count.
 */
export function formatPretty(
  result: LintResult,
  snapshot: Snapshot,
  { color = false }: PrettyOptions = {},
): string {
  const style = (format: Parameters<typeof styleText>[0], text: string) =>
    color ? styleText(format, text, { validateStream: false }) : text;

  const groups = new Map<string, Problem[]>();
  for (const key of order(snapshot)) groups.set(key, []);
  for (const problem of result.problems) {
    const key = keyOf(problem.target);
    groups.set(key, [...(groups.get(key) ?? []), problem]);
  }

  const width = Math.max(0, ...result.problems.map((problem) => problem.rule.length));
  const lines: string[] = [];
  for (const [key, problems] of groups) {
    if (problems.length === 0) continue;
    lines.push('', `  ${style('bold', key)}`);
    for (const problem of problems) {
      const symbol = problem.severity === 'error' ? style('red', '✖') : style('yellow', '⚠');
      lines.push(`  ${symbol} ${style('dim', problem.rule.padEnd(width))}  ${problem.message}`);
      if (problem.fix) lines.push(`    ${' '.repeat(width)}  ${style('cyan', `→ ${problem.fix}`)}`);
    }
  }

  const checked = describeChecked(snapshot);
  const total = result.problems.length;
  if (total === 0) return `${style('green', '✔')} No problems in ${checked}\n`;
  const counts = `${plural(result.errorCount, 'error')}, ${plural(result.warningCount, 'warning')}`;
  const symbol = result.errorCount > 0 ? style('red', '✖') : style('yellow', '⚠');
  lines.push('', `${symbol} ${plural(total, 'problem')} (${counts}) in ${checked}`);
  return `${lines.join('\n')}\n`;
}

function keyOf(target: Target): string {
  switch (target.kind) {
    case 'server':
      return 'server';
    case 'resource':
      return `resource ${target.uri}`;
    default:
      return `${target.kind} ${target.name}`;
  }
}

// The server, then each tool, prompt and resource in the order the server lists them.
function order(snapshot: Snapshot): string[] {
  return [
    'server',
    ...snapshot.tools.map((tool) => `tool ${tool.name}`),
    ...snapshot.prompts.map((prompt) => `prompt ${prompt.name}`),
    ...snapshot.resources.map((resource) => `resource ${resource.uri}`),
  ];
}

function describeChecked(snapshot: Snapshot): string {
  const parts = [
    plural(snapshot.tools.length, 'tool'),
    ...(snapshot.prompts.length ? [plural(snapshot.prompts.length, 'prompt')] : []),
    ...(snapshot.resources.length ? [plural(snapshot.resources.length, 'resource')] : []),
  ];
  return parts.join(', ');
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}
