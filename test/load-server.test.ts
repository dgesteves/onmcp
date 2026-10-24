import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, test } from 'vitest';

import { SnapshotError } from '../src/load/file.js';
import { readHttpServer, readStdioServer } from '../src/load/server.js';
import { fakeHttpServer, SESSION_ID } from './fixtures/servers/fake-http-server.mjs';

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

describe('readHttpServer', () => {
  const listing = JSON.parse(readFileSync(fixture('docs.json'), 'utf8')) as object;
  const servers: Server[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      server.close();
    }
  });

  /** Starts the fake HTTP server on a free port, and returns its requests and its base URL. */
  async function serve(options?: Parameters<typeof fakeHttpServer>[1]) {
    const { server, requests } = fakeHttpServer(listing, options);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { server, requests, base: `http://127.0.0.1:${port}` };
  }

  test('lists every page of what the server has, and ends the session', async () => {
    const { requests, base } = await serve();
    const snapshot = await readHttpServer({ url: `${base}/mcp` });
    expect(snapshot.server).toEqual({ name: 'docs', version: '2.1.0', title: 'Docs' });
    expect(snapshot.instructions).toBe('Search before you fetch a page.');
    expect(snapshot.tools.map((tool) => tool.name)).toEqual(['search_docs', 'get_page', 'sync']);
    expect(snapshot.prompts.map((prompt) => prompt.name)).toEqual(['summarize']);
    expect(snapshot.resources.map((resource) => resource.uri)).toEqual(['docs://index']);
    expect(requests.at(-1)).toMatchObject({
      method: 'DELETE',
      headers: { 'mcp-session-id': SESSION_ID },
    });
  });

  test('falls back to HTTP+SSE when the server doesn’t take the POST', async () => {
    const { requests, base } = await serve({ legacy: true });
    const snapshot = await readHttpServer({ url: `${base}/sse`, headers: { 'X-Team': 'docs' } });
    expect(snapshot.server).toEqual({ name: 'docs', version: '2.1.0', title: 'Docs' });
    expect(snapshot.tools.map((tool) => tool.name)).toEqual(['search_docs', 'get_page', 'sync']);
    expect(snapshot.prompts).toHaveLength(1);
    expect(snapshot.resources).toHaveLength(1);
    // The Streamable HTTP POST it refused, then the stream and the messages, all with the header.
    expect(requests.slice(0, 2).map(({ method }) => method)).toEqual(['POST', 'GET']);
    expect(requests.every(({ headers }) => headers['x-team'] === 'docs')).toBe(true);
  });

  test('says what the POST got when the URL is no HTTP+SSE endpoint either', async () => {
    const { requests, base } = await serve({ legacy: true });
    await expect(readHttpServer({ url: `${base}/mcp` })).rejects.toThrow(
      new SnapshotError(
        `Couldn’t list what ${base}/mcp has: it answered 405 Method Not Allowed: is that the server’s MCP endpoint? It often ends in /mcp.`,
      ),
    );
    expect(requests.map(({ method }) => method)).toEqual(['POST', 'GET']);
  });

  test('doesn’t fall back when the server wants a token', async () => {
    const { requests, base } = await serve({ token: 'secret', legacy: true });
    await expect(readHttpServer({ url: `${base}/sse` })).rejects.toThrow(/401 Unauthorized/);
    expect(requests.map(({ method }) => method)).toEqual(['POST']);
  });

  test('sends the headers it’s given with every request', async () => {
    const { requests, base } = await serve({ token: 'secret' });
    const snapshot = await readHttpServer({
      url: `${base}/mcp`,
      headers: { Authorization: 'Bearer secret', 'X-Team': 'docs' },
    });
    expect(snapshot.tools).toHaveLength(3);
    expect(requests.every(({ headers }) => headers['x-team'] === 'docs')).toBe(true);
  });

  test('says when the server wants a token', async () => {
    const { base } = await serve({ token: 'secret' });
    await expect(readHttpServer({ url: `${base}/mcp` })).rejects.toThrow(
      new SnapshotError(
        `Couldn’t list what ${base}/mcp has: it answered 401 Unauthorized: send a token in an Authorization header.`,
      ),
    );
  });

  test('says when there’s no MCP endpoint at the URL, and leaves its query out', async () => {
    const { base } = await serve();
    await expect(readHttpServer({ url: `${base}/sse?key=secret` })).rejects.toThrow(
      new SnapshotError(
        `Couldn’t list what ${base}/sse has: it answered 404 Not Found: is that the server’s MCP endpoint? It often ends in /mcp.`,
      ),
    );
  });

  test('says when the URL is a web page', async () => {
    const { base } = await serve({ html: true });
    await expect(readHttpServer({ url: base })).rejects.toThrow(
      /: it answered with text\/html, not MCP: is that the server’s MCP endpoint\?/,
    );
  });

  test('says when nothing is listening', async () => {
    const { server, base } = await serve();
    await new Promise((resolve) => server.close(resolve));
    await expect(readHttpServer({ url: `${base}/mcp` })).rejects.toThrow(
      /: nothing is listening there\.$/,
    );
  });

  test('gives up on a server that doesn’t answer', async () => {
    const { base } = await serve({ silent: true });
    await expect(readHttpServer({ url: `${base}/mcp` }, { timeoutMs: 300 })).rejects.toThrow(
      /: it didn’t answer in time\.$/,
    );
  });

  test('says when the URL isn’t one', async () => {
    await expect(readHttpServer({ url: 'http://' })).rejects.toThrow(
      new SnapshotError('"http://" isn’t a URL.'),
    );
  });
});
