import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { lint } from './lint.js';
import { CONFIG_FILE, findConfig, loadConfig } from './load/config.js';
import { readSnapshot } from './load/file.js';
import { readHttpServer, readStdioServer } from './load/server.js';
import { formatGithub } from './report/github.js';
import { formatJson } from './report/json.js';
import { formatPretty } from './report/pretty.js';
import { formatSarif } from './report/sarif.js';
import { rules } from './rules/index.js';
import { serve, type ServeOptions } from './serve.js';
import { printable } from './util/printable.js';
import { VERSION } from './version.js';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** ANSI colors in the output: bin.ts turns them on for a terminal that isn't NO_COLOR. */
  color: boolean;
  /** The folder to look for onmcp.config.json in (default: the current one). */
  cwd?: string;
  /** stdin is a terminal, so `serve` says it waits for an agent: bin.ts sets it. */
  interactive?: boolean;
  /** Starts the MCP server (default: on stdio). The tests pass their own. */
  serve?: (options: ServeOptions) => void;
}

/** The exit codes: no errors, errors found, and onmcp couldn't run. */
export const EXIT = { ok: 0, problems: 1, usage: 2 } as const;

const USAGE = `Usage: onmcp check [options] -- <command> [args...]
       onmcp check [options] <url>
       onmcp check [options] <snapshot.json>
       onmcp serve [--config <file>]

Checks the tools, prompts and resources an MCP server lists, the way a model reads them.

After --, the command that starts the server over stdio, as a host's config gives it:
  onmcp check -- npx -y @modelcontextprotocol/server-everything
<url> is the server's endpoint, over Streamable HTTP or the older HTTP+SSE:
  onmcp check https://example.com/mcp --header "Authorization: Bearer $TOKEN"
<snapshot.json> is what a server lists, saved: a tools/list result, a JSON-RPC response that holds
one, or onmcp's own { server, instructions, tools, prompts, resources, resourceTemplates }.

serve starts onmcp's own MCP server on stdio, for the agent writing a server to check it as it
goes. Its tools are check_server and check_listing.

Options:
  -c, --config <file>         The config to use (default: ${CONFIG_FILE}, if there is one)
  -f, --format <format>       pretty, for a person (default), json, for a script, sarif, for
                              code scanning, or github, for annotations in GitHub Actions
  -H, --header <name: value>  Sent with each request to a <url>; repeat it for more than one
  --max-warnings <n>          Exit 1 with more than n warnings too, so 0 fails on any warning
                              (default: no limit)
  --timeout <seconds>         How long the server has to answer each request (default: 30)
  -h, --help                  Show this help
  -v, --version               Show the version

Exits 0 with no errors, 1 with errors (or more warnings than --max-warnings), and 2 when it
couldn't run.
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
        format: { type: 'string', short: 'f', default: 'pretty' },
        header: { type: 'string', short: 'H', multiple: true },
        'max-warnings': { type: 'string' },
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
  if (command === 'serve') return startServer(values, rest.length > 0 || dash !== -1, io);
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
  const limit = values['max-warnings'];
  if (limit !== undefined && !/^\d+$/.test(limit)) {
    io.stderr(`--max-warnings takes a whole number of warnings, such as 0, not "${limit}".\n`);
    return EXIT.usage;
  }
  const maxWarnings = limit === undefined ? Infinity : Number(limit);
  const { format } = values;
  if (format !== 'pretty' && format !== 'json' && format !== 'sarif' && format !== 'github') {
    io.stderr(`--format takes pretty, json, sarif or github, not "${format}".\n`);
    return EXIT.usage;
  }

  try {
    const config = await loadConfig(values.config ?? findConfig(io.cwd ?? '.'), rules);
    const options = { timeoutMs: seconds * 1000 };
    const snapshot =
      serverCommand !== undefined
        ? await readStdioServer({ command: serverCommand, args: serverArgs }, options)
        : url !== undefined
          ? await readHttpServer({ url, headers }, options)
          : await readSnapshot(target ?? '');
    const result = lint(snapshot, rules, config);
    // A snapshot file is where SARIF results and GitHub annotations point.
    const source =
      (format === 'sarif' || format === 'github') && target !== undefined && url === undefined
        ? { ...locate(target, io.cwd ?? process.cwd()), text: await readFile(target, 'utf8') }
        : undefined;
    switch (format) {
      case 'pretty':
        io.stdout(formatPretty(result, snapshot, { color: io.color }));
        break;
      case 'json':
        io.stdout(formatJson(result, snapshot));
        break;
      case 'sarif':
        io.stdout(
          formatSarif(result, snapshot, {
            rules,
            ...(source && { file: { uri: source.uri, text: source.text } }),
          }),
        );
        break;
      case 'github':
        io.stdout(formatGithub(result, source && { file: source }));
        break;
    }
    // On stderr, so a json, sarif or github report on stdout stays one a program can read.
    const tooMany = result.warningCount > maxWarnings;
    if (tooMany) {
      const count = `${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}`;
      io.stderr(`onmcp: ${count}, more than the ${maxWarnings} --max-warnings allows.\n`);
    }
    return result.errorCount > 0 || tooMany ? EXIT.problems : EXIT.ok;
  } catch (error) {
    // An error can quote the server: its stderr, or the message it answered with.
    io.stderr(`onmcp: ${printable((error as Error).message, { lines: true })}\n`);
    return EXIT.usage;
  }
}

// A file by its path from the folder onmcp runs in, which in CI is the repository's root, with
// forward slashes, and as a URI. A file outside the folder has its full path and a file:// URI.
function locate(file: string, cwd: string): { path: string; uri: string } {
  const absolute = resolve(file);
  const path = relative(cwd, absolute);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return { path: absolute, uri: pathToFileURL(absolute).href };
  }
  const parts = path.split(sep);
  return { path: parts.join('/'), uri: parts.map(encodeURIComponent).join('/') };
}

/** Starts the MCP server, once its config is known to be right: a later edit is read per call. */
async function startServer(
  values: {
    config?: string;
    format?: string;
    header?: string[];
    timeout?: string;
    'max-warnings'?: string;
  },
  extra: boolean,
  io: Io,
): Promise<number> {
  const checkOnly =
    values.format !== 'pretty' ||
    values.header !== undefined ||
    values.timeout !== undefined ||
    values['max-warnings'] !== undefined;
  if (extra || checkOnly) {
    io.stderr(`serve takes only --config: the agent says what to check.\n\n${USAGE}`);
    return EXIT.usage;
  }
  const cwd = io.cwd ?? process.cwd();
  try {
    await loadConfig(values.config ?? findConfig(cwd), rules);
  } catch (error) {
    io.stderr(`onmcp: ${printable((error as Error).message, { lines: true })}\n`);
    return EXIT.usage;
  }
  if (io.interactive) {
    io.stderr(
      'onmcp serve is an MCP server: it is waiting for an agent on stdin. Add it to your agent, or run onmcp check here. Ctrl+C quits.\n',
    );
  }
  (io.serve ?? serve)({ cwd, ...(values.config !== undefined && { config: values.config }) });
  return EXIT.ok;
}
