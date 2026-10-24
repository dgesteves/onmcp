import type { LintResult } from '../lint.js';
import { rules as onmcpRules } from '../rules/index.js';
import type { Rule, Severity, Snapshot, Target } from '../types.js';
import { VERSION } from '../version.js';

const HOME = 'https://github.com/dgesteves/onmcp';

/** What `--format sarif` prints: the parts of SARIF 2.1.0 that onmcp writes. */
export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: {
    tool: {
      driver: {
        name: 'onmcp';
        version: string;
        informationUri: string;
        rules: {
          id: string;
          shortDescription: { text: string };
          helpUri: string;
          defaultConfiguration: { level: Severity };
        }[];
      };
    };
    results: {
      ruleId: string;
      ruleIndex?: number;
      level: Severity;
      message: { text: string };
      locations: {
        physicalLocation?: {
          artifactLocation: { uri: string };
          region: { startLine: number };
        };
        logicalLocations: { name: string; fullyQualifiedName: string; kind: string }[];
      }[];
    }[];
  }[];
}

export interface SarifOptions {
  /** The rules the result came from, which the log lists with their docs (default: onmcp's). */
  rules?: readonly Rule[];
  /**
   * The snapshot file that was checked, as a URI and its text: each result then points at the line
   * where its tool, prompt or resource is in it.
   */
  file?: { uri: string; text: string };
}

/**
 * Formats a lint result as SARIF 2.1.0, the format GitHub code scanning and other CI tools read.
 * Each result has a logical location, such as `tool/search/inputSchema.properties.q`, since a
 * server's listing isn't in a source file: when it was checked from a file, a physical one too.
 */
export function formatSarif(
  result: LintResult,
  snapshot: Snapshot,
  { rules = onmcpRules, file }: SarifOptions = {},
): string {
  const ruleIndex = new Map(rules.map((rule, index) => [rule.name, index]));
  const log: SarifLog = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'onmcp',
            version: VERSION,
            informationUri: HOME,
            rules: rules.map((rule) => ({
              id: rule.name,
              shortDescription: { text: rule.description },
              helpUri: `${HOME}/blob/main/docs/rules/${rule.name}.md`,
              defaultConfiguration: { level: rule.severity },
            })),
          },
        },
        results: result.problems.map((problem) => ({
          ruleId: problem.rule,
          ...(ruleIndex.has(problem.rule) && { ruleIndex: ruleIndex.get(problem.rule) }),
          level: problem.severity,
          message: { text: [problem.message, problem.fix].filter(Boolean).join(' ') },
          locations: [
            {
              ...(file && {
                physicalLocation: {
                  artifactLocation: { uri: file.uri },
                  region: { startLine: lineOf(problem.target, file.text) },
                },
              }),
              logicalLocations: [logicalLocation(problem.target, snapshot)],
            },
          ],
        })),
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function logicalLocation(target: Target, snapshot: Snapshot) {
  const path = target.path ? `/${target.path}` : '';
  switch (target.kind) {
    case 'server':
      return {
        name: snapshot.server?.name ?? 'server',
        fullyQualifiedName: `server${path}`,
        kind: 'module',
      };
    case 'resource':
      return {
        name: target.uri,
        fullyQualifiedName: `resource/${target.uri}${path}`,
        kind: 'resource',
      };
    default:
      return {
        name: target.name,
        fullyQualifiedName: `${target.kind}/${target.name}${path}`,
        kind: 'function',
      };
  }
}

// The line where the file defines the target: the "name" of a tool or a prompt, or the "uri" of a
// resource, from where its list starts ("tools", say, so a server with the tool's name isn't
// it), or the server's "instructions". Line 1 when the file writes it another way, such as with
// escapes JSON.stringify doesn't use.
const SECTIONS = { tool: '"tools"', prompt: '"prompts"', resource: '"resources"' } as const;

function lineOf(target: Target, text: string): number {
  if (target.kind === 'server' && target.path !== 'instructions') return 1;
  const [key, value] =
    target.kind === 'server'
      ? ['instructions', undefined]
      : target.kind === 'resource'
        ? ['uri', target.uri]
        : ['name', target.name];
  const pattern = new RegExp(
    `"${key}"\\s*:${value === undefined ? '' : `\\s*${escape(JSON.stringify(value))}`}`,
    'g',
  );
  pattern.lastIndex =
    target.kind === 'server' ? 0 : Math.max(0, text.indexOf(SECTIONS[target.kind]));
  const match = pattern.exec(text);
  return match ? text.slice(0, match.index).split('\n').length : 1;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
