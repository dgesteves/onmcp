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
      checkOptions(rule, options as Record<string, unknown>);
      return { severity, options: { ...rule.defaults, ...options } };
    }
  }
  throw new ConfigError(
    `The config sets "${rule.name}" to ${JSON.stringify(setting)}: use "off", "warning", "error", or [severity, options].`,
  );
}

// An option the rule doesn't take, or a value of another type than its default, would change
// nothing, and the rule would run as if the config didn't set it.
function checkOptions(rule: Rule, options: Record<string, unknown>): void {
  const defaults: Record<string, unknown> = { ...rule.defaults };
  const names = Object.keys(defaults);
  for (const [name, value] of Object.entries(options)) {
    if (!Object.hasOwn(defaults, name)) {
      const meant = closest(name, names);
      const hint = meant
        ? `. Did you mean "${meant}"?`
        : names.length > 0
          ? `: it takes ${names.map((known) => `"${known}"`).join(', ')}.`
          : ': it has no options.';
      throw new ConfigError(`Unknown option "${name}" for "${rule.name}" in the config${hint}`);
    }
    const expected = kind(defaults[name]);
    if (kind(value) !== expected) {
      throw new ConfigError(
        `The config sets "${name}" for "${rule.name}" to ${JSON.stringify(value)}: it takes ${/^[aeiou]/.test(expected) ? 'an' : 'a'} ${expected}.`,
      );
    }
  }
}

function kind(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  return value === null ? 'null' : typeof value;
}
