import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, test } from 'vitest';

import { lint } from '../src/lint.js';
import { snapshotFromClient } from '../src/load/server.js';
import type { JsonReport } from '../src/report/json.js';
import { rules } from '../src/rules/index.js';
import { createServer, type ServeOptions } from '../src/serve.js';

const fixture = (name: string) => new URL(`fixtures/${name}`, import.meta.url).pathname;

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

/** A client connected to onmcp's server in memory. */
async function connect(options?: ServeOptions): Promise<Client> {
  const server = createServer(options);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  return {
    isError: result.isError === true,
    text: first?.text ?? '',
    report: result.structuredContent as JsonReport | undefined,
  };
}

const undescribed = {
  tools: [
    { name: 'search', description: 'Searches the docs.', inputSchema: { type: 'object' } },
    { name: 'sync', inputSchema: { type: 'object' } },
  ],
};

describe('onmcp’s MCP server', () => {
  test('passes its own rules', async () => {
    const client = await connect();
    const snapshot = await snapshotFromClient(client);
    expect(snapshot.tools.map((tool) => tool.name)).toEqual([
      'check_server',
      'check_listing',
      'explain_rule',
    ]);
    expect(lint(snapshot, rules).problems).toEqual([]);
  });

  test('marks check_listing and explain_rule read-only, and check_server not', async () => {
    const { tools } = await (await connect()).listTools();
    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]))).toEqual({
      check_server: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      check_listing: { readOnlyHint: true, openWorldHint: false },
      explain_rule: { readOnlyHint: true, openWorldHint: false },
    });
  });
});

describe('check_listing', () => {
  test('returns the problems as text, and as the object --format json prints', async () => {
    const { isError, text, report } = await call(await connect(), 'check_listing', {
      listing: undescribed,
    });
    expect(isError).toBe(false);
    expect(text).toContain('  tool sync\n  ✖ tool-description  The tool has no description.');
    expect(report).toMatchObject({
      checked: { tools: 2, prompts: 0, resources: 0, resourceTemplates: 0 },
      errorCount: 1,
      warningCount: 0,
      problems: [
        {
          rule: 'tool-description',
          severity: 'error',
          target: { kind: 'tool', name: 'sync', path: 'description' },
        },
      ],
    });
  });

  test('takes a bare array of tools', async () => {
    const { report } = await call(await connect(), 'check_listing', {
      listing: undescribed.tools,
    });
    expect(report?.errorCount).toBe(1);
  });

  test('says what isn’t in MCP’s shape, as an error result', async () => {
    const { isError, text } = await call(await connect(), 'check_listing', {
      listing: { tools: [{ name: 2 }] },
    });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not a snapshot MCP would send:\n {2}tools\.0\.name:/);
  });

  test('reads onmcp.config.json from its folder on each call', async () => {
    const { report } = await call(await connect({ cwd: fixture('config') }), 'check_listing', {
      listing: undescribed,
    });
    expect(report?.problems).toEqual([]);
  });

  test('says when the config is wrong', async () => {
    const { isError, text } = await call(
      await connect({ config: fixture('config/typo.json') }),
      'check_listing',
      { listing: undescribed },
    );
    expect(isError).toBe(true);
    expect(text).toMatch(/typo\.json: Unknown rule/);
  });
});

describe('check_server', () => {
  test('starts the server over stdio, checks it, and stops it', async () => {
    const { isError, report } = await call(await connect(), 'check_server', {
      command: process.execPath,
      args: [fixture('servers/fake-server.mjs'), fixture('servers/docs.json')],
    });
    expect(isError).toBe(false);
    expect(report).toMatchObject({
      server: { name: 'docs', version: '2.1.0' },
      checked: { tools: 3, prompts: 1, resources: 1 },
      errorCount: 1,
    });
  });

  test('says when the server didn’t start', async () => {
    const { isError, text } = await call(await connect(), 'check_server', {
      command: 'onmcp-no-such-command',
    });
    expect(isError).toBe(true);
    expect(text).toBe('Couldn’t list what `onmcp-no-such-command` has: the command wasn’t found.');
  });

  test.each([
    [{}, 'Give command (with args) for a server over stdio, or url for one over HTTP.'],
    [
      { command: 'node', url: 'http://localhost:3000/mcp' },
      'Give command (with args) for a server over stdio, or url for one over HTTP.',
    ],
    [{ command: 'node', headers: { 'X-Team': 'docs' } }, 'headers go with url, not with command.'],
    [
      { url: 'localhost:3000/mcp' },
      'url takes an http:// or https:// endpoint, not "localhost:3000/mcp".',
    ],
  ])('rejects %j', async (args, message) => {
    const { isError, text } = await call(await connect(), 'check_server', args);
    expect(isError).toBe(true);
    expect(text).toBe(message);
  });
});

describe('explain_rule', () => {
  test('returns the rule’s docs page', async () => {
    const { isError, text } = await call(await connect(), 'explain_rule', {
      rule: 'param-description',
    });
    expect(isError).toBe(false);
    expect(text).toMatch(
      /^# param-description\n\nEvery argument in a tool's `inputSchema` has a description/,
    );
    expect(text).toContain('## Fix');
  });

  test('takes only the names of onmcp’s rules', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === 'explain_rule')?.inputSchema;
    expect(schema?.properties?.rule).toMatchObject({ enum: rules.map((rule) => rule.name) });
    const { isError } = await call(client, 'explain_rule', { rule: '../../package' });
    expect(isError).toBe(true);
  });
});
