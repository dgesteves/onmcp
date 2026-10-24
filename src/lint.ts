import type { Config, Problem, Rule, Severity, Snapshot } from './types.js';
import { closest } from './util/closest.js';

export interface LintResult {
  problems: Problem[];
  errorCount: number;
  warningCount: number;
}

/** A config that names a rule onmcp doesn't have, or sets one in a way it can't read. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** A rule as a config sets it: on, at a severity, with its options. */
export interface ConfiguredRule {
  rule: Rule;
  severity: Severity;
  options: object;
}

/**
 * The rules the config leaves on, in rule order, each at the severity and with the options it
 * gives them. A config that names a rule onmcp doesn't have, or sets one in a way it can't read,
 * is a ConfigError.
 */
export function configure(rules: readonly Rule[], config: Config = {}): ConfiguredRule[] {
  const settings = config.rules ?? {};
  const known = new Set(rules.map((rule) => rule.name));
  for (const name of Object.keys(settings)) {
    if (known.has(name)) continue;
    const meant = closest(name, known);
    throw new ConfigError(
      `Unknown rule "${name}" in the config.${meant ? ` Did you mean "${meant}"?` : ''}`,
    );
  }
  return rules.flatMap((rule) => {
    const setting = resolve(rule, settings[rule.name]);
    return setting ? [{ rule, ...setting }] : [];
  });
}

/**
 * Runs each rule on the snapshot, at the severity and with the options the config gives it, and
 * returns the problems in rule order. A rule that throws stops the run: its error names the rule.
 */
export function lint(snapshot: Snapshot, rules: readonly Rule[], config: Config = {}): LintResult {
  const problems: Problem[] = [];
  for (const { rule, severity, options } of configure(rules, config)) {
    try {
      rule.check({
        snapshot,
        options,
        report: (report) => problems.push({ rule: rule.name, severity, ...report }),
      });
    } catch (error) {
      throw new Error(`The rule "${rule.name}" failed: ${String(error)}`, { cause: error });
    }
  }

  const errorCount = problems.filter((problem) => problem.severity === 'error').length;
  return { problems, errorCount, warningCount: problems.length - errorCount };
}

// A setting is read as unknown: configs come from JSON files, which can hold anything.
function resolve(
  rule: Rule,
  setting: unknown,
): { severity: Severity; options: object } | undefined {
  if (setting === 'off') return undefined;
  if (setting === undefined) return { severity: rule.severity, options: { ...rule.defaults } };
  if (setting === 'error' || setting === 'warning') {
    return { severity: setting, options: { ...rule.defaults } };
  }
  if (Array.isArray(setting) && setting.length === 2) {
    const [severity, options] = setting as [unknown, unknown];
    if (
      (severity === 'error' || severity === 'warning') &&
      typeof options === 'object' &&
      options !== null &&
      !Array.isArray(options)
    ) {
      return { severity, options: { ...rule.defaults, ...options } };
    }
  }
  throw new ConfigError(
    `The config sets "${rule.name}" to ${JSON.stringify(setting)}: use "off", "warning", "error", or [severity, options].`,
  );
}
