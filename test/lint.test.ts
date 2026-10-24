import { describe, expect, test } from 'vitest';

import { ConfigError, configure, lint } from '../src/lint.js';
import type { Config, Rule, Snapshot } from '../src/types.js';

const snapshot: Snapshot = {
  tools: [
    { name: 'search', inputSchema: { type: 'object' } },
    { name: 'fetch', description: 'Fetches a page.', inputSchema: { type: 'object' } },
  ],
  prompts: [],
  resources: [],
};

// Reports each tool without a description.
const needsDescription: Rule = {
  name: 'needs-description',
  description: 'Every tool has a description.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      if (!tool.description) {
        report({ target: { kind: 'tool', name: tool.name }, message: 'No description.' });
      }
    }
  },
};

// Reports each tool whose name is longer than its maxLength option.
const shortNames: Rule<{ maxLength: number }> = {
  name: 'short-names',
  description: 'Tool names are short.',
  severity: 'warning',
  defaults: { maxLength: 5 },
  check({ snapshot, options, report }) {
    for (const tool of snapshot.tools) {
      if (tool.name.length > options.maxLength) {
        report({
          target: { kind: 'tool', name: tool.name },
          message: `Longer than ${options.maxLength}.`,
        });
      }
    }
  },
};

const rules = [needsDescription, shortNames] as Rule[];

describe('lint', () => {
  test('reports at each rule’s own severity, in rule order', () => {
    const result = lint(snapshot, rules);
    expect(result.problems).toEqual([
      {
        rule: 'needs-description',
        severity: 'error',
        target: { kind: 'tool', name: 'search' },
        message: 'No description.',
      },
      {
        rule: 'short-names',
        severity: 'warning',
        target: { kind: 'tool', name: 'search' },
        message: 'Longer than 5.',
      },
    ]);
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
  });

  test('a config turns a rule off, or changes its severity', () => {
    const config: Config = { rules: { 'needs-description': 'off', 'short-names': 'error' } };
    const result = lint(snapshot, rules, config);
    expect(result.problems.map((problem) => [problem.rule, problem.severity])).toEqual([
      ['short-names', 'error'],
    ]);
    expect(result).toMatchObject({ errorCount: 1, warningCount: 0 });
  });

  test('options in the config go on top of the rule’s defaults', () => {
    const result = lint(snapshot, rules, {
      rules: { 'short-names': ['warning', { maxLength: 4 }] },
    });
    expect(
      result.problems.filter((problem) => problem.rule === 'short-names').map((p) => p.target),
    ).toEqual([
      { kind: 'tool', name: 'search' },
      { kind: 'tool', name: 'fetch' },
    ]);
  });

  test('a config that names an unknown rule is an error', () => {
    expect(() => lint(snapshot, rules, { rules: { 'no-such-rule': 'error' } })).toThrow(
      new ConfigError('Unknown rule "no-such-rule" in the config.'),
    );
  });

  test('says which rule a misspelled one probably meant', () => {
    expect(() => lint(snapshot, rules, { rules: { 'short-nmaes': 'off' } })).toThrow(
      new ConfigError('Unknown rule "short-nmaes" in the config. Did you mean "short-names"?'),
    );
  });

  test('a setting it can’t read is an error', () => {
    const config = { rules: { 'short-names': 'on' } } as unknown as Config;
    expect(() => lint(snapshot, rules, config)).toThrow(ConfigError);
  });

  test.each([
    [
      { maxLenght: 4 },
      'Unknown option "maxLenght" for "short-names" in the config. Did you mean "maxLength"?',
    ],
    [{ size: 4 }, 'Unknown option "size" for "short-names" in the config: it takes "maxLength".'],
    // Not an option, though every object has it.
    [
      { toString: 4 },
      'Unknown option "toString" for "short-names" in the config: it takes "maxLength".',
    ],
    [
      { maxLength: '4' },
      'The config sets "maxLength" for "short-names" to "4": it takes a number.',
    ],
    [
      { maxLength: [4] },
      'The config sets "maxLength" for "short-names" to [4]: it takes a number.',
    ],
  ])('options %j are an error', (options, message) => {
    expect(() => lint(snapshot, rules, { rules: { 'short-names': ['warning', options] } })).toThrow(
      new ConfigError(message),
    );
  });

  test('options for a rule that has none are an error', () => {
    expect(() =>
      lint(snapshot, rules, { rules: { 'needs-description': ['error', { strict: true }] } }),
    ).toThrow(
      new ConfigError(
        'Unknown option "strict" for "needs-description" in the config: it has no options.',
      ),
    );
    expect(
      lint(snapshot, rules, { rules: { 'needs-description': ['error', {}] } }).errorCount,
    ).toBe(1);
  });

  test('a rule that throws stops the run, and the error names it', () => {
    const broken: Rule = {
      name: 'broken',
      description: 'Throws.',
      severity: 'error',
      check() {
        throw new TypeError('boom');
      },
    };
    expect(() => lint(snapshot, [broken])).toThrow('The rule "broken" failed: TypeError: boom');
  });
});

describe('configure', () => {
  test('lists the rules the config leaves on, with their severity and options', () => {
    const config: Config = {
      rules: { 'needs-description': 'off', 'short-names': ['error', { maxLength: 8 }] },
    };
    expect(configure(rules, config)).toEqual([
      { rule: shortNames, severity: 'error', options: { maxLength: 8 } },
    ]);
  });
});
