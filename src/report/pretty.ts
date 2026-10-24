import { styleText } from 'node:util';

import type { LintResult } from '../lint.js';
import type { Problem, Snapshot } from '../types.js';
import { printable } from '../util/printable.js';
import { label } from './target.js';

export interface PrettyOptions {
  /** ANSI colors: the CLI turns them on for a terminal that isn't NO_COLOR. */
  color?: boolean;
}

/**
 * Formats a lint result for a person in a terminal: the problems grouped under the tool, prompt,
 * resource or template they're on, in the order the server lists them, each with its fix, then a count.
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
    const key = label(problem.target);
    groups.set(key, [...(groups.get(key) ?? []), problem]);
  }

  const width = Math.max(0, ...result.problems.map((problem) => problem.rule.length));
  const lines: string[] = [];
  for (const [key, problems] of groups) {
    if (problems.length === 0) continue;
    // Names, URIs and messages hold what the server wrote, which can be meant for the terminal.
    lines.push('', `  ${style('bold', printable(key))}`);
    for (const problem of problems) {
      const symbol = problem.severity === 'error' ? style('red', '✖') : style('yellow', '⚠');
      const message = printable(problem.message);
      lines.push(`  ${symbol} ${style('dim', problem.rule.padEnd(width))}  ${message}`);
      if (problem.fix) {
        lines.push(`    ${' '.repeat(width)}  ${style('cyan', `→ ${printable(problem.fix)}`)}`);
      }
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

// The server, then each tool, prompt, resource and template in the order the server lists them.
function order(snapshot: Snapshot): string[] {
  return [
    'server',
    ...snapshot.tools.map((tool) => `tool ${tool.name}`),
    ...snapshot.prompts.map((prompt) => `prompt ${prompt.name}`),
    ...snapshot.resources.map((resource) => `resource ${resource.uri}`),
    ...snapshot.resourceTemplates.map((template) => `resource template ${template.uriTemplate}`),
  ];
}

function describeChecked(snapshot: Snapshot): string {
  const { prompts, resources, resourceTemplates } = snapshot;
  const parts = [
    plural(snapshot.tools.length, 'tool'),
    ...(prompts.length ? [plural(prompts.length, 'prompt')] : []),
    ...(resources.length ? [plural(resources.length, 'resource')] : []),
    ...(resourceTemplates.length ? [plural(resourceTemplates.length, 'resource template')] : []),
  ];
  return parts.join(', ');
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}
