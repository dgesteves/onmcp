import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import type { Snapshot } from '../types.js';

/** A file onmcp can't read as a snapshot: not JSON, or not in a shape MCP lists. */
export class SnapshotError extends Error {
  override name = 'SnapshotError';
}

// MCP's own shapes, checked only as far as the rules rely on them. Keys MCP adds later, such as
// icons and _meta, pass through.
const schema = z.looseObject({});

const tool = z.looseObject({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: schema,
  outputSchema: schema.optional(),
  annotations: z
    .looseObject({
      title: z.string().optional(),
      readOnlyHint: z.boolean().optional(),
      destructiveHint: z.boolean().optional(),
      idempotentHint: z.boolean().optional(),
      openWorldHint: z.boolean().optional(),
    })
    .optional(),
});

const prompt = z.looseObject({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.looseObject({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
});

const resource = z.looseObject({
  uri: z.string(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

const resourceTemplate = z.looseObject({
  uriTemplate: z.string(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

const server = z.looseObject({
  name: z.string(),
  version: z.string(),
  title: z.string().optional(),
});

const snapshot = z.looseObject({
  server: server.optional(),
  // initialize's result calls it serverInfo.
  serverInfo: server.optional(),
  instructions: z.string().optional(),
  tools: z.array(tool).default([]),
  prompts: z.array(prompt).default([]),
  resources: z.array(resource).default([]),
  resourceTemplates: z.array(resourceTemplate).default([]),
});

/**
 * Reads a snapshot from parsed JSON, in any of the shapes people save one in: onmcp's own
 * (`{ server, instructions, tools, prompts, resources, resourceTemplates }`), the result of
 * `tools/list` (or of `prompts/list`, `resources/list` or `resources/templates/list`), a JSON-RPC
 * response that holds one, as an Inspector log shows it, or a bare array of tools.
 */
export function parseSnapshot(json: unknown): Snapshot {
  let value = json;
  if (Array.isArray(value)) value = { tools: value };
  else if (isObject(value) && value.jsonrpc === '2.0' && 'result' in value) value = value.result;
  if (!isObject(value)) throw new SnapshotError('Expected an object or an array of tools.');

  const parsed = snapshot.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new SnapshotError(`Not a snapshot MCP would send:\n${issues.join('\n')}`);
  }
  const { server, serverInfo, instructions, tools, prompts, resources, resourceTemplates } =
    parsed.data;
  const info = server ?? serverInfo;
  return {
    ...(info && { server: info }),
    ...(instructions !== undefined && { instructions }),
    tools,
    prompts,
    resources,
    resourceTemplates,
  };
}

/** Reads a snapshot from a JSON file: see parseSnapshot for the shapes it takes. */
export async function readSnapshot(file: string): Promise<Snapshot> {
  return parseSnapshotFile(await readJsonFile(file), file);
}

/** Reads a JSON file, a snapshot or a host's config. */
export async function readJsonFile(file: string): Promise<unknown> {
  const text = await readFile(file, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SnapshotError(`${file} isn't JSON: ${(error as Error).message}`, { cause: error });
  }
}

/** parseSnapshot, with the file's name in its errors. */
export function parseSnapshotFile(json: unknown, file: string): Snapshot {
  try {
    return parseSnapshot(json);
  } catch (error) {
    if (error instanceof SnapshotError) {
      throw new SnapshotError(`${file}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
