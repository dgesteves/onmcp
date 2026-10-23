import type { Rule, Target } from '../types.js';
import { strings } from '../util/strings.js';

// Files that hold credentials, or the config of the agent itself. Each pattern starts where a
// path can start (not after a letter, a digit or a dot), so process.env and .envrc don't match.
const START = String.raw`(?<![\w.])(?:~[\\/])?`;
const PATTERNS = [
  new RegExp(`${START}\\.ssh(?:[\\\\/][\\w.-]*[\\w-])?`),
  /\bid_(?:rsa|dsa|ecdsa|ed25519)\b(?:\.pub)?/,
  new RegExp(`${START}\\.aws[\\\\/]credentials\\b`),
  new RegExp(`${START}\\.(?:npmrc|pypirc|netrc|git-credentials|pgpass)\\b`),
  new RegExp(`${START}\\.docker[\\\\/]config\\.json\\b`),
  new RegExp(`${START}\\.kube[\\\\/]config\\b`),
  new RegExp(`${START}\\.gnupg\\b`),
  /\bapplication_default_credentials\.json\b/,
  /(?<![\w-])(?:[\w.~-]*[\\/])*mcp\.json\b/,
  /\bclaude_desktop_config\.json\b/,
  new RegExp(`${START}\\.env(?:\\.[\\w-]+)?(?![\\w-])`),
  /\/etc\/(?:passwd|shadow|sudoers)\b/,
  /\bwallet\.dat\b/,
];

/**
 * A tool that points the model at credentials or at the agent's own config can make it read them
 * and pass them on, as an argument to this tool or another: that's what exfiltration through a
 * poisoned tool looks like. An SSH or a config tool can mention them honestly, so it's a warning.
 */
export const sensitivePaths: Rule = {
  name: 'sensitive-paths',
  description:
    'No credential or agent config paths, such as ~/.ssh or mcp.json, in what a model reads.',
  severity: 'warning',
  check({ snapshot, report }) {
    const scan = (target: (path: string) => Target, value: unknown) => {
      for (const [path, text] of strings(value, '')) {
        const lowercase = text
          .normalize('NFKC')
          .replace(/\p{Cf}/gu, '')
          .toLowerCase();
        const matches = PATTERNS.map((pattern) => pattern.exec(lowercase)?.[0]).filter(
          (match) => match !== undefined,
        );
        // id_rsa inside ~/.ssh/id_rsa is one path, not two.
        const found = [...new Set(matches)].filter(
          (match) => !matches.some((other) => other !== match && other.includes(match)),
        );
        if (found.length === 0) continue;
        const label = path.includes('.') ? path : `The ${path}`;
        report({
          target: target(path),
          message: `${label} mentions ${found.join(', ')}: text that points the model at credentials or config files can make it read and send them.`,
          fix: 'If managing that file is the tool’s job, say so plainly. Otherwise, take the path out.',
        });
      }
    };
    scan((path) => ({ kind: 'server', path }), {
      ...(snapshot.instructions !== undefined && { instructions: snapshot.instructions }),
    });
    for (const tool of snapshot.tools) {
      scan((path) => ({ kind: 'tool', name: tool.name, path }), tool);
    }
    for (const prompt of snapshot.prompts) {
      scan((path) => ({ kind: 'prompt', name: prompt.name, path }), prompt);
    }
    for (const resource of snapshot.resources) {
      scan((path) => ({ kind: 'resource', uri: resource.uri, path }), resource);
    }
  },
};
