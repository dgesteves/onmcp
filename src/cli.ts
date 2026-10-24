import { parseArgs } from 'node:util';

import { ConfigError, configure, lint } from './lint.js';
import { CONFIG_FILE, findConfig, readConfig } from './load/config.js';
import { readSnapshot } from './load/file.js';
import { readHttpServer, readStdioServer } from './load/server.js';
import { formatPretty } from './report/pretty.js';
import { rules } from './rules/index.js';
import type { Config } from './types.js';
import { VERSION } from './version.js';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** ANSI colors in the output: bin.ts turns them on for a terminal that isn't NO_COLOR. */
  color: boolean;
  /** The folder to look for onmcp.config.json in (default: the current one). */
  cwd?: string;
}

/** The exit codes: no errors, errors found, and onmcp couldn't run. */
export const EXIT = { ok: 0, problems: 1, usage: 2 } as const;

const USAGE = `Usage: onmcp check [options] -- <command> [args...]
       onmcp check [options] <url>
       onmcp check [options] <snapshot.json>

Checks the tools, prompts and resources an MCP server lists, the way a model reads them.

After --, the command that starts the server over stdio, as a host's config gives it:
  onmcp check -- npx -y @modelcontextprotocol/server-everything
<url> is the server's endpoint, over Streamable HTTP or the older HTTP+SSE:
  onmcp check https://example.com/mcp --header "Authorization: Bearer $TOKEN"
<snapshot.json> is what a server lists, saved: a tools/list result, a JSON-RPC response that holds
one, or onmcp's own { server, instructions, tools, prompts, resources }.

Options:
  -c, --config <file>         The config to use (default: ${CONFIG_FILE}, if there is one)
  -H, --header <name: value>  Sent with each request to a <url>; repeat it for more than one
  --timeout <seconds>         How long the server has to answer each request (default: 30)
  -h, --help                  Show this help
  -v, --version               Show the version

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
        config: { type: 'string', short: 'c' },
        header: { type: 'string', short: 'H', multiple: true },
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
  const [target] = rest;
  const [serverCommand, ...serverArgs] = server;
  if (
    command === undefined ||
    rest.length > 1 ||
    (target === undefined) === (serverCommand === undefined)
  ) {
    io.stderr(
      target !== undefined && serverCommand !== undefined
        ? `Give a snapshot, a URL or a command after --, not more than one.\n\n${USAGE}`
        : USAGE,
    );
    return EXIT.usage;
  }
  const url = target !== undefined && /^https?:\/\//i.test(target) ? target : undefined;
  if (values.header !== undefined && url === undefined) {
    io.stderr('--header goes with a server’s <url>, not a snapshot or a command.\n');
    return EXIT.usage;
  }
  const headers: Record<string, string> = {};
  for (const header of values.header ?? []) {
    const colon = header.indexOf(':');
    const name = header.slice(0, colon).trim();
    if (colon === -1 || !/^[\w!#$%&'*+.^`|~-]+$/.test(name)) {
      // Without the header itself, which is likely to hold a token.
      io.stderr('--header takes "Name: value", such as "Authorization: Bearer <token>".\n');
      return EXIT.usage;
    }
    headers[name] = header.slice(colon + 1).trim();
  }
  const seconds = values.timeout === undefined ? 30 : Number(values.timeout);
  if (!(seconds > 0)) {
    io.stderr(`--timeout takes a number of seconds, not "${values.timeout ?? ''}".\n`);
    return EXIT.usage;
  }

  try {
    const config = await loadConfig(values.config ?? findConfig(io.cwd ?? '.'));
    const options = { timeoutMs: seconds * 1000 };
    const snapshot =
      serverCommand !== undefined
        ? await readStdioServer({ command: serverCommand, args: serverArgs }, options)
        : url !== undefined
          ? await readHttpServer({ url, headers }, options)
          : await readSnapshot(target ?? '');
    const result = lint(snapshot, rules, config);
    io.stdout(formatPretty(result, snapshot, { color: io.color }));
    return result.errorCount > 0 ? EXIT.problems : EXIT.ok;
  } catch (error) {
    io.stderr(`onmcp: ${(error as Error).message}\n`);
    return EXIT.usage;
  }
}

/** Reads the config and checks it against the rules, before a server starts for nothing. */
async function loadConfig(file: string | undefined): Promise<Config> {
  if (file === undefined) return {};
  const config = await readConfig(file);
  try {
    configure(rules, config);
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(`${file}: ${error.message}`);
    throw error;
  }
  return config;
}
