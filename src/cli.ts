import { parseArgs } from 'node:util';

import { lint } from './lint.js';
import { readSnapshot } from './load/file.js';
import { readStdioServer } from './load/server.js';
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

const USAGE = `Usage: onmcp check [options] -- <command> [args...]
       onmcp check [options] <snapshot.json>

Checks the tools, prompts and resources an MCP server lists, the way a model reads them.

After --, the command that starts the server over stdio, as a host's config gives it:
  onmcp check -- npx -y @modelcontextprotocol/server-everything
<snapshot.json> is what a server lists, saved: a tools/list result, a JSON-RPC response that holds
one, or onmcp's own { server, instructions, tools, prompts, resources }.

Options:
  --timeout <seconds>  How long the server has to answer each request (default: 30)
  -h, --help           Show this help
  -v, --version        Show the version

Exits 0 with no errors, 1 with errors, and 2 when it couldn't run.
`;

/** Runs the CLI on its arguments (without node and the script) and returns the exit code. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  // Everything after -- is the server's command, with options of its own that aren't onmcp's.
  const dash = argv.indexOf('--');
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const server = dash === -1 ? [] : argv.slice(dash + 1);

  let parsed;
  try {
    parsed = parseArgs({
      args: [...own],
      allowPositionals: true,
      options: {
        timeout: { type: 'string' },
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
  if (command !== undefined && command !== 'check') {
    io.stderr(`Unknown command "${command}".\n\n${USAGE}`);
    return EXIT.usage;
  }
  const [file] = rest;
  const [serverCommand, ...serverArgs] = server;
  if (
    command === undefined ||
    rest.length > 1 ||
    (file === undefined) === (serverCommand === undefined)
  ) {
    io.stderr(
      file !== undefined && serverCommand !== undefined
        ? `Give a snapshot or a command after --, not both.\n\n${USAGE}`
        : USAGE,
    );
    return EXIT.usage;
  }
  const seconds = values.timeout === undefined ? 30 : Number(values.timeout);
  if (!(seconds > 0)) {
    io.stderr(`--timeout takes a number of seconds, not "${values.timeout ?? ''}".\n`);
    return EXIT.usage;
  }

  try {
    const snapshot =
      serverCommand === undefined
        ? await readSnapshot(file ?? '')
        : await readStdioServer(
            { command: serverCommand, args: serverArgs },
            { timeoutMs: seconds * 1000 },
          );
    const result = lint(snapshot, rules);
    io.stdout(formatPretty(result, snapshot, { color: io.color }));
    return result.errorCount > 0 ? EXIT.problems : EXIT.ok;
  } catch (error) {
    io.stderr(`onmcp: ${(error as Error).message}\n`);
    return EXIT.usage;
  }
}
