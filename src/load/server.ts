import { STATUS_CODES } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import {
  Client,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  StreamableHTTPClientTransport,
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
  /** The server's Streamable HTTP endpoint, such as `https://example.com/mcp`. */
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
 * then every page of the tools, prompts and resources it says it has.
 */
export async function snapshotFromClient(
  client: Client,
  { timeoutMs = 30_000 }: ConnectOptions = {},
): Promise<Snapshot> {
  const capabilities = client.getServerCapabilities() ?? {};
  const options = { timeout: timeoutMs };
  const [tools, prompts, resources] = await Promise.all([
    capabilities.tools ? client.listTools(undefined, options).then((r) => r.tools) : [],
    capabilities.prompts ? client.listPrompts(undefined, options).then((r) => r.prompts) : [],
    capabilities.resources ? client.listResources(undefined, options).then((r) => r.resources) : [],
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
  });
}

/** Starts a server over stdio, lists what it has, and stops it. */
export async function readStdioServer(
  server: StdioServer,
  options: ConnectOptions = {},
): Promise<Snapshot> {
  const { timeoutMs = 30_000 } = options;
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

  const client = new Client({ name: 'onmcp', version: VERSION });
  const shown = [server.command, ...(server.args ?? [])].join(' ');
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return await snapshotFromClient(client, options);
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    const output = stderr.trim() ? `\nIts stderr ended with:\n${indent(stderr.trim())}` : '';
    throw new SnapshotError(`Couldn’t list what \`${shown}\` has: ${describe(error)}${output}`, {
      cause: error,
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Connects to a server over Streamable HTTP, lists what it has, and ends the session. */
export async function readHttpServer(
  server: HttpServer,
  options: ConnectOptions = {},
): Promise<Snapshot> {
  const { timeoutMs = 30_000 } = options;
  const href = String(server.url);
  if (!URL.canParse(href)) throw new SnapshotError(`"${href}" isn’t a URL.`);
  const url = new URL(href);
  const transport = new StreamableHTTPClientTransport(url, {
    ...(server.headers !== undefined && { requestInit: { headers: server.headers } }),
  });

  const client = new Client({ name: 'onmcp', version: VERSION });
  // Without the query or user info, which can hold a token: error messages end up in CI logs.
  const shown = `${url.origin}${url.pathname}`;
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return await snapshotFromClient(client, options);
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError(`Couldn’t list what ${shown} has: ${describeHttp(error)}`, {
      cause: error,
    });
  } finally {
    // close() only aborts the requests still open: the DELETE ends the session on the server too.
    // A server that doesn't answer it gets as long as it has for any request, and close() then
    // gives up on it.
    await Promise.race([
      transport.terminateSession(),
      delay(timeoutMs, undefined, { ref: false }),
    ]).catch(() => undefined);
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
  if (error instanceof SdkHttpError) {
    const status = `${error.status} ${STATUS_CODES[error.status] ?? ''}`.trim();
    if (error.status === 401) {
      return `it answered ${status}: send a token in an Authorization header.`;
    }
    // Not there, or there but not taking a POST: a page, or a server on the older HTTP+SSE.
    if (error.status === 404 || error.status === 405) return `it answered ${status}: ${ENDPOINT}`;
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
