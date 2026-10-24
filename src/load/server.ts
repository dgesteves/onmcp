import { STATUS_CODES } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import {
  Client,
  METHOD_NOT_FOUND,
  ProtocolError,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  SSEClientTransport,
  SseError,
  StreamableHTTPClientTransport,
  type Transport,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type { Snapshot } from '../types.js';
import { VERSION } from '../version.js';
import { parseSnapshot, SnapshotError } from './file.js';

export interface StdioServer {
  command: string;
  args?: string[];
  cwd?: string;
  /** Added to the environment the SDK passes on: PATH, HOME and the like. */
  env?: Record<string, string>;
}

export interface HttpServer {
  /** The server's endpoint, such as `https://example.com/mcp`, or `/sse` for HTTP+SSE. */
  url: string | URL;
  /** Sent with every request, such as `{ Authorization: 'Bearer <token>' }`. */
  headers?: Record<string, string>;
}

export interface ConnectOptions {
  /** How long the server has to answer each request: initialize and each list. */
  timeoutMs?: number;
}

// The last of the server's stderr kept for an error message: the end is where it says what broke.
const STDERR_TAIL = 4_000;

/**
 * Lists what a client sees from a connected server: its info and instructions from initialize,
 * then every page of the tools, prompts, resources and resource templates it says it has.
 */
export async function snapshotFromClient(
  client: Client,
  { timeoutMs = 30_000 }: ConnectOptions = {},
): Promise<Snapshot> {
  const capabilities = client.getServerCapabilities() ?? {};
  const options = { timeout: timeoutMs };
  const [tools, prompts, resources, resourceTemplates] = await Promise.all([
    capabilities.tools ? client.listTools(undefined, options).then((r) => r.tools) : [],
    capabilities.prompts ? client.listPrompts(undefined, options).then((r) => r.prompts) : [],
    capabilities.resources ? client.listResources(undefined, options).then((r) => r.resources) : [],
    capabilities.resources
      ? client
          .listResourceTemplates(undefined, options)
          .then((r) => r.resourceTemplates)
          .catch(noTemplates)
      : [],
  ]);
  const info = client.getServerVersion();
  return parseSnapshot({
    ...(info && {
      server: {
        name: info.name,
        version: info.version,
        ...(info.title !== undefined && { title: info.title }),
      },
    }),
    instructions: client.getInstructions(),
    tools,
    prompts,
    resources,
    resourceTemplates,
  });
}

// Many servers with resources have no templates, and no handler for resources/templates/list:
// "method not found" from one means it has none, not that it failed.
function noTemplates(error: unknown): [] {
  if (error instanceof ProtocolError && error.code === METHOD_NOT_FOUND) return [];
  throw error;
}

/** Starts a server over stdio, lists what it has, and stops it. */
export async function readStdioServer(
  server: StdioServer,
  options: ConnectOptions = {},
): Promise<Snapshot> {
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args ?? [],
    ...(server.cwd !== undefined && { cwd: server.cwd }),
    ...(server.env !== undefined && { env: { ...defaultEnv(), ...server.env } }),
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL);
  });

  const shown = [server.command, ...(server.args ?? [])].join(' ');
  try {
    return await listOver(transport, options);
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    const output = stderr.trim() ? `\nIts stderr ended with:\n${indent(stderr.trim())}` : '';
    throw new SnapshotError(`Couldn’t list what \`${shown}\` has: ${describe(error)}${output}`, {
      cause: error,
    });
  }
}

/**
 * Connects to a server over Streamable HTTP, lists what it has, and ends the session. A server
 * that answers the first POST with a 4xx gets a second try over HTTP+SSE, the transport MCP had
 * before, as the spec says a client should.
 */
export async function readHttpServer(
  server: HttpServer,
  options: ConnectOptions = {},
): Promise<Snapshot> {
  const href = String(server.url);
  if (!URL.canParse(href)) throw new SnapshotError(`"${href}" isn’t a URL.`);
  const url = new URL(href);
  const requestInit = { headers: server.headers ?? {} };
  // Without the query or user info, which can hold a token: error messages end up in CI logs.
  const shown = `${url.origin}${url.pathname}`;
  const fail = (error: unknown) =>
    error instanceof SnapshotError
      ? error
      : new SnapshotError(`Couldn’t list what ${shown} has: ${describeHttp(error)}`, {
          cause: error,
        });

  try {
    return await listOver(new StreamableHTTPClientTransport(url, { requestInit }), options);
  } catch (error) {
    // A 401 or 403 is about the token, not the transport: HTTP+SSE would get the same.
    const status = error instanceof SdkHttpError ? error.status : 0;
    if (status < 400 || status >= 500 || status === 401 || status === 403) throw fail(error);
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- for the servers still on it
      return await listOver(new SSEClientTransport(url, { requestInit }), options);
    } catch (sseError) {
      // A URL that can't open an event stream either isn't an endpoint at all, and what the POST
      // got says so better, unless the GET was the one that asked for a token.
      throw fail(sseError instanceof SseError && sseError.code !== 401 ? error : sseError);
    }
  }
}

/** Connects over the transport, lists what the server has, and closes the connection. */
async function listOver(transport: Transport, options: ConnectOptions): Promise<Snapshot> {
  const { timeoutMs = 30_000 } = options;
  const client = new Client({ name: 'onmcp', version: VERSION });
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return await snapshotFromClient(client, options);
  } finally {
    // close() only aborts the requests still open: the DELETE ends a Streamable HTTP session on
    // the server too. A server that doesn't answer it gets as long as it has for any request, and
    // close() then gives up on it.
    if (transport instanceof StreamableHTTPClientTransport) {
      await Promise.race([
        transport.terminateSession(),
        delay(timeoutMs, undefined, { ref: false }),
      ]).catch(() => undefined);
    }
    await client.close().catch(() => undefined);
  }
}

function defaultEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT/.test(message)) return 'the command wasn’t found.';
  if (/timed? ?out/i.test(message)) return 'it didn’t answer in time.';
  if (/closed/i.test(message)) return 'it exited before it answered.';
  return message;
}

const ENDPOINT = 'is that the server’s MCP endpoint? It often ends in /mcp.';

function describeHttp(error: unknown): string {
  // The status of a POST that failed, or of the GET for an HTTP+SSE event stream.
  const code =
    error instanceof SdkHttpError
      ? error.status
      : error instanceof SseError
        ? error.code
        : undefined;
  if (code !== undefined) {
    const status = `${code} ${STATUS_CODES[code] ?? ''}`.trim();
    if (code === 401) return `it answered ${status}: send a token in an Authorization header.`;
    // Not there, or there but taking neither a POST nor a GET for an event stream: a page.
    if (code === 404 || code === 405) return `it answered ${status}: ${ENDPOINT}`;
    return `it answered ${status}.`;
  }
  if (error instanceof SdkError) {
    if (error.code === SdkErrorCode.RequestTimeout) return 'it didn’t answer in time.';
    if (error.code === SdkErrorCode.ClientHttpUnexpectedContent) {
      const { contentType } = (error.data ?? {}) as { contentType?: string };
      return `it answered with ${contentType ?? 'no content type'}, not MCP: ${ENDPOINT}`;
    }
  }
  // fetch() says only "fetch failed": its cause says why.
  const cause =
    error instanceof Error ? (error.cause as NodeJS.ErrnoException | undefined) : undefined;
  if (cause?.code === 'ECONNREFUSED') return 'nothing is listening there.';
  if (cause?.code === 'ENOTFOUND') return 'its host wasn’t found.';
  if (cause instanceof Error) return `${cause.message}.`;
  return error instanceof Error ? error.message : String(error);
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
