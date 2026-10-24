import { lint } from '../src/lint.js';
import type { Config, Problem, Rule, Snapshot } from '../src/types.js';

/** A snapshot with nothing in it but what the test gives. */
export function snapshotOf(partial: Partial<Snapshot>): Snapshot {
  return { tools: [], prompts: [], resources: [], resourceTemplates: [], ...partial };
}

/** The problems one rule reports on a snapshot, with the options the test gives it. */
export function run(
  rule: Rule,
  partial: Partial<Snapshot>,
  options?: Record<string, unknown>,
): Problem[] {
  const config: Config = options ? { rules: { [rule.name]: [rule.severity, options] } } : {};
  return lint(snapshotOf(partial), [rule], config).problems;
}
