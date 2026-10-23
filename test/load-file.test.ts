import { describe, expect, test } from 'vitest';

import { parseSnapshot, readSnapshot, SnapshotError } from '../src/load/file.js';

const fixture = (name: string) => new URL(`fixtures/${name}`, import.meta.url).pathname;
const tool = { name: 'search', inputSchema: { type: 'object' } };

describe('parseSnapshot', () => {
  test('reads onmcp’s own shape', () => {
    const snapshot = parseSnapshot({
      server: { name: 'docs', version: '1.2.0' },
      instructions: 'Search before you fetch.',
      tools: [tool],
      prompts: [{ name: 'summarize', arguments: [{ name: 'path', required: true }] }],
      resources: [{ uri: 'docs://index', name: 'index', mimeType: 'text/markdown' }],
    });
    expect(snapshot).toEqual({
      server: { name: 'docs', version: '1.2.0' },
      instructions: 'Search before you fetch.',
      tools: [tool],
      prompts: [{ name: 'summarize', arguments: [{ name: 'path', required: true }] }],
      resources: [{ uri: 'docs://index', name: 'index', mimeType: 'text/markdown' }],
    });
  });

  test('reads a tools/list result, with no prompts or resources', () => {
    expect(parseSnapshot({ tools: [tool] })).toEqual({ tools: [tool], prompts: [], resources: [] });
  });

  test('reads a bare array of tools', () => {
    expect(parseSnapshot([tool]).tools).toEqual([tool]);
  });

  test('reads serverInfo, as initialize’s result names it', () => {
    expect(parseSnapshot({ serverInfo: { name: 'docs', version: '1.0.0' } }).server).toEqual({
      name: 'docs',
      version: '1.0.0',
    });
  });

  test('keeps the keys MCP adds that onmcp doesn’t check', () => {
    const withMeta = { ...tool, _meta: { a: 1 }, icons: [{ src: 'https://example.com/i.png' }] };
    expect(parseSnapshot([withMeta]).tools[0]).toEqual(withMeta);
  });

  test('names each field that isn’t in MCP’s shape', () => {
    expect(() =>
      parseSnapshot({ tools: [{ name: 'a', inputSchema: { type: 'object' } }, { name: 2 }] }),
    ).toThrow(
      new SnapshotError(
        'Not a snapshot MCP would send:\n' +
          '  tools.1.name: Invalid input: expected string, received number\n' +
          '  tools.1.inputSchema: Invalid input: expected object, received undefined',
      ),
    );
  });

  test('rejects JSON that is neither an object nor an array', () => {
    expect(() => parseSnapshot('tools')).toThrow(SnapshotError);
    expect(() => parseSnapshot(null)).toThrow(SnapshotError);
  });
});

describe('readSnapshot', () => {
  test('reads a JSON-RPC response saved from an Inspector log', async () => {
    const snapshot = await readSnapshot(fixture('docs-server.json'));
    expect(snapshot.tools.map((t) => t.name)).toEqual(['search_docs', 'get_page']);
    expect(snapshot.tools[0]?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  });

  test('says which file isn’t JSON', async () => {
    await expect(readSnapshot(fixture('../load-file.test.ts'))).rejects.toThrow(
      /load-file\.test\.ts isn't JSON/,
    );
  });
});
