import { parseArgs } from 'node:util';

import { lint } from './lint.js';
import { readSnapshot } from './load/file.js';
import { formatPretty } from './report/pretty.js';
import { rules } from './rules/index.js';
import { VERSION } from './version.js';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** ANSI colors in the output: bin.ts turns them on for a terminal that isn't NO_COLOR. */
  color: boolean;
}

/** The exit codes: no errors, errors found, and onmcp couldn't run. */
export const EXIT = { ok: 0, problems: 1, usage: 2 } as const;

const USAGE = `Usage: onmcp check <snapshot.json> [options]

Checks the tools, prompts and resources an MCP server lists, the way a model reads them.
<snapshot.json> is what the server lists: a tools/list result, a JSON-RPC response that holds one,
or onmcp's own { server, instructions, tools, prompts, resources }.

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Exits 0 with no errors, 1 with errors, and 2 when it couldn't run.
`;

/** Runs the CLI on its arguments (without node and the script) and returns the exit code. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return EXIT.usage;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(USAGE);
    return EXIT.ok;
  }
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return EXIT.ok;
  }

  const [command, ...rest] = positionals;
  if (command !== 'check' || rest.length !== 1 || rest[0] === undefined) {
    io.stderr(
      command === undefined || command === 'check'
        ? USAGE
        : `Unknown command "${command}".\n\n${USAGE}`,
    );
    return EXIT.usage;
  }

  try {
    const snapshot = await readSnapshot(rest[0]);
    const result = lint(snapshot, rules);
    io.stdout(formatPretty(result, snapshot, { color: io.color }));
    return result.errorCount > 0 ? EXIT.problems : EXIT.ok;
  } catch (error) {
    io.stderr(`onmcp: ${(error as Error).message}\n`);
    return EXIT.usage;
  }
}
