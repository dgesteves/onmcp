import { Client } from '@modelcontextprotocol/client';
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

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
