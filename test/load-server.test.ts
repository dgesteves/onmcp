import { describe, expect, test } from 'vitest';

import { SnapshotError } from '../src/load/file.js';
import { readStdioServer } from '../src/load/server.js';

const fixture = (name: string) => new URL(`fixtures/servers/${name}`, import.meta.url).pathname;
const fake = (...args: string[]) => ({
  command: process.execPath,
  args: [fixture('fake-server.mjs'), fixture('docs.json'), ...args],
});

describe('readStdioServer', () => {
  test('lists every page of the tools, prompts and resources, and the server’s info', async () => {
    const snapshot = await readStdioServer(fake());
    expect(snapshot.server).toEqual({ name: 'docs', version: '2.1.0', title: 'Docs' });
    expect(snapshot.instructions).toBe('Search before you fetch a page.');
    // Three tools in pages of two.
    expect(snapshot.tools.map((tool) => tool.name)).toEqual(['search_docs', 'get_page', 'sync']);
    expect(snapshot.prompts.map((prompt) => prompt.name)).toEqual(['summarize']);
    expect(snapshot.resources.map((resource) => resource.uri)).toEqual(['docs://index']);
  });

  test('says when the command isn’t found', async () => {
    await expect(readStdioServer({ command: 'onmcp-no-such-command' })).rejects.toThrow(
      new SnapshotError(
        'Couldn’t list what `onmcp-no-such-command` has: the command wasn’t found.',
      ),
    );
  });

  test('shows the end of the server’s stderr when it exits before it answers', async () => {
    const error = await readStdioServer(fake('--crash')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapshotError);
    expect((error as Error).message).toMatch(
      /has: it exited before it answered\.\nIts stderr ended with:\n {2}Starting docs server\n {2}Error: DOCS_TOKEN is not set$/,
    );
  });

  test('gives up on a server that doesn’t answer', async () => {
    await expect(readStdioServer(fake('--silent'), { timeoutMs: 300 })).rejects.toThrow(
      /it didn’t answer in time\.$/,
    );
  });
});
