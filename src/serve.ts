import { type CallToolResult, McpServer, type ToolAnnotations } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

import { lint } from './lint.js';
import { findConfig, loadConfig } from './load/config.js';
import { parseSnapshot } from './load/file.js';
import { readHttpServer, readStdioServer } from './load/server.js';
import { jsonReport } from './report/json.js';
import { formatPretty } from './report/pretty.js';
import { rules } from './rules/index.js';
import type { Snapshot } from './types.js';
import { printable } from './util/printable.js';
import { VERSION } from './version.js';

export interface ServeOptions {
  /**
   * The folder to look for onmcp.config.json in, and to start servers in (default: the current
   * one).
   */
  cwd?: string;
  /** The config to use for every check, instead of looking for one in cwd each time. */
  config?: string;
}

const INSTRUCTIONS =
  'onmcp checks an MCP server the way a model reads it. After you change a server’s tools, prompts or resources, call check_server with the command that starts it, or its URL, and fix what it reports. For a listing you already have as JSON, call check_listing.';

// check_listing only reads what it's given. check_server runs a command, which could do anything.
const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const RUNS_A_COMMAND: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const MAX_TIMEOUT = 300;

// What --format json prints, so a tool's result reads the same as the CLI's.
const report = z.object({
  onmcp: z.string().describe('The version of onmcp that checked it.'),
  server: z
    .object({ name: z.string(), version: z.string(), title: z.string().optional() })
    .optional()
    .describe('The server’s name and version, as it gave them.'),
  checked: z
    .object({
      tools: z.number().int(),
      prompts: z.number().int(),
      resources: z.number().int(),
      resourceTemplates: z.number().int(),
    })
    .describe('How many of each the server lists.'),
  errorCount: z.number().int(),
  warningCount: z.number().int(),
  problems: z
    .array(
      z.object({
        rule: z.string().describe('The rule’s name. Its docs say why it matters.'),
        severity: z.enum(['error', 'warning']),
        target: z
          .record(z.string(), z.string())
          .describe(
            'Where it is: { kind, name } for a tool or prompt, { kind, uri } for a resource, { kind, uriTemplate } for a template, and the path into it.',
          ),
        message: z.string(),
        fix: z.string().optional().describe('What to change, in one sentence.'),
      }),
    )
    .describe('In rule order.'),
});

/** onmcp's own MCP server: tools that check another server, for the agent writing it. */
export function createServer({ cwd = process.cwd(), config }: ServeOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'onmcp', version: VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  // The config is read on each call, so a change to it applies to the next check.
  const check = async (load: () => Promise<Snapshot>): Promise<CallToolResult> => {
    try {
      const settings = await loadConfig(config ?? findConfig(cwd), rules);
      const snapshot = await load();
      const result = lint(snapshot, rules, settings);
      return {
        content: [{ type: 'text', text: formatPretty(result, snapshot).replace(/^\n/, '') }],
        structuredContent: { ...jsonReport(result, snapshot) },
      };
    } catch (error) {
      return fail((error as Error).message);
    }
  };

  server.registerTool(
    'check_server',
    {
      title: 'Check an MCP server',
      description:
        'Starts an MCP server with `command` and `args`, or connects to one at `url`, and checks the tools, prompts and resources it lists the way a model reads them: names that don’t parse, schemas a model can’t fill in, arguments with no description, and text that hides or gives orders to the model. Returns each problem with its rule, severity, where it is and the fix. Call it after you change a server’s tools, prompts or resources. The command runs in the folder onmcp was started in, and is stopped once it has answered.',
      inputSchema: z.object({
        command: z
          .string()
          .optional()
          .describe(
            'The command that starts the server over stdio, as a host’s config gives it, such as "node" or "npx".',
          ),
        args: z
          .array(z.string())
          .optional()
          .describe('The command’s arguments, such as ["dist/server.js", "--read-only"].'),
        url: z
          .string()
          .optional()
          .describe(
            'The server’s endpoint, over Streamable HTTP or HTTP+SSE, such as "http://localhost:3000/mcp". Give it instead of command.',
          ),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Sent with each request to url, such as { "Authorization": "Bearer <token>" }.',
          ),
        timeout: z
          .number()
          .positive()
          .max(MAX_TIMEOUT)
          .optional()
          .describe('How many seconds the server has to answer each request. 30 by default.'),
      }),
      outputSchema: report,
      annotations: RUNS_A_COMMAND,
    },
    async ({ command, args, url, headers, timeout = 30 }) => {
      if ((command === undefined) === (url === undefined)) {
        return fail('Give command (with args) for a server over stdio, or url for one over HTTP.');
      }
      if (headers !== undefined && url === undefined) {
        return fail('headers go with url, not with command.');
      }
      if (url !== undefined && !/^https?:\/\//i.test(url)) {
        return fail(`url takes an http:// or https:// endpoint, not "${url}".`);
      }
      const options = { timeoutMs: timeout * 1000 };
      return check(() =>
        url !== undefined
          ? readHttpServer({ url, ...(headers && { headers }) }, options)
          : readStdioServer({ command: command ?? '', args: args ?? [], cwd }, options),
      );
    },
  );

  server.registerTool(
    'check_listing',
    {
      title: 'Check an MCP server’s listing',
      description:
        'Checks what an MCP server lists, given as JSON, the way a model reads it, and returns each problem with its rule, severity, where it is and the fix. Use it for a listing you already have, such as one from an Inspector log. For a server you can start, call check_server.',
      inputSchema: z.object({
        listing: z
          .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
          .describe(
            'The listing: a tools/list result, a JSON-RPC response that holds one, a bare array of tools, or { server, instructions, tools, prompts, resources, resourceTemplates }.',
          ),
      }),
      outputSchema: report,
      annotations: READ_ONLY,
    },
    ({ listing }) => check(() => Promise.resolve(parseSnapshot(listing))),
  );

  return server;
}

/** Serves onmcp's MCP server on stdio, until the client closes it. */
export function serve(options: ServeOptions = {}): void {
  serveStdio(() => createServer(options));
}

// An error can quote the server being checked: its stderr, or the message it answered with.
function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: printable(message, { lines: true }) }] };
}
