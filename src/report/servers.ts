import { styleText } from 'node:util';

import type { LintResult } from '../lint.js';
import type { Snapshot } from '../types.js';
import { printable } from '../util/printable.js';
import { jsonReport, type JsonReport } from './json.js';
import { formatPretty, plural, type PrettyOptions } from './pretty.js';

/** What onmcp made of one server in a host's config. */
export interface ServerResult {
  name: string;
  /** Its command or URL, never its args, env or headers, which can hold a token. */
  shown: string;
  /** The ${...} references onmcp passed as written. */
  unexpanded: string[];
  outcome: { result: LintResult; snapshot: Snapshot } | { error: string } | { skipped: string };
}

/** What `--format json` prints for a host's config: each server's report, or why there isn't one. */
export interface JsonServersReport {
  onmcp: string;
  servers: ({ name: string; unexpanded: string[] } & (
    Omit<JsonReport, 'onmcp'> | { error: string } | { skipped: string }
  ))[];
  errorCount: number;
  warningCount: number;
}

/** The problems and the servers that couldn't be checked, across all of them. */
export function totals(results: readonly ServerResult[]) {
  let errorCount = 0;
  let warningCount = 0;
  let failed = 0;
  for (const { outcome } of results) {
    if ('result' in outcome) {
      errorCount += outcome.result.errorCount;
      warningCount += outcome.result.warningCount;
    } else if ('error' in outcome) {
      failed += 1;
    }
  }
  return { errorCount, warningCount, failed };
}

/**
 * Formats what onmcp found in each server of a host's config for a person: each server under its
 * name, as the pretty format shows one, then a count across all of them.
 */
export function formatPrettyServers(
  results: readonly ServerResult[],
  { color = false }: PrettyOptions = {},
): string {
  const style = (format: Parameters<typeof styleText>[0], text: string) =>
    color ? styleText(format, text, { validateStream: false }) : text;

  const blocks = results.map(({ name, shown, unexpanded, outcome }) => {
    // A name and a command come from the config, and an error can quote the server.
    const lines = [
      `${style('bold', printable(name))}  ${style('dim', printable(shown))}`.trimEnd(),
    ];
    if (unexpanded.length > 0) {
      lines.push(`  ${style('dim', `Passed as written: ${printable(unexpanded.join(', '))}`)}`);
    }
    if ('skipped' in outcome) {
      lines.push(`  ${style('dim', `Skipped: ${outcome.skipped}`)}`);
    } else if ('error' in outcome) {
      const message = printable(outcome.error, { lines: true }).replaceAll('\n', '\n    ');
      lines.push(`  ${style('red', '✖')} ${message}`);
    } else {
      // The server's own report, its count indented under its name like the rest.
      const report = formatPretty(outcome.result, outcome.snapshot, { color });
      lines.push(
        report
          .replace(/^\n/, '')
          .replace(/^(?=\S)/gm, '  ')
          .trimEnd(),
      );
    }
    return lines.join('\n');
  });

  const { errorCount, warningCount, failed } = totals(results);
  const checked = results.filter(({ outcome }) => 'result' in outcome).length;
  const skipped = results.filter(({ outcome }) => 'skipped' in outcome).length;
  const total = errorCount + warningCount;
  const symbol =
    errorCount > 0 || failed > 0
      ? style('red', '✖')
      : warningCount > 0
        ? style('yellow', '⚠')
        : style('green', '✔');
  const found =
    total === 0
      ? `No problems in ${plural(checked, 'server')}.`
      : `${plural(total, 'problem')} (${plural(errorCount, 'error')}, ${plural(warningCount, 'warning')}) in ${plural(checked, 'server')}.`;
  // "1 server couldn’t be checked, and 2 were skipped."
  const wasSkipped = `${skipped === 1 ? 'was' : 'were'} skipped`;
  const rest =
    failed > 0 && skipped > 0
      ? ` ${plural(failed, 'server')} couldn’t be checked, and ${skipped} ${wasSkipped}.`
      : failed > 0
        ? ` ${plural(failed, 'server')} couldn’t be checked.`
        : skipped > 0
          ? ` ${plural(skipped, 'server')} ${wasSkipped}.`
          : '';
  return `${blocks.join('\n\n')}\n\n${symbol} ${found}${rest}\n`;
}

/** Formats what onmcp found in each server of a host's config as JSON, for a script or CI. */
export function formatJsonServers(results: readonly ServerResult[], version: string): string {
  const { errorCount, warningCount } = totals(results);
  const report: JsonServersReport = {
    onmcp: version,
    servers: results.map(({ name, unexpanded, outcome }) => {
      if (!('result' in outcome)) return { name, unexpanded, ...outcome };
      const { onmcp: _, ...rest } = jsonReport(outcome.result, outcome.snapshot);
      return { name, unexpanded, ...rest };
    }),
    errorCount,
    warningCount,
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
