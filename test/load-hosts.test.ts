import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, test } from 'vitest';

import { SnapshotError } from '../src/load/file.js';
import { isHostConfig, readHostConfig } from '../src/load/hosts.js';

const project = mkdtempSync(join(tmpdir(), 'onmcp-hosts-'));
const file = join(project, '.mcp.json');

describe('isHostConfig', () => {
  test.each([
    [{ mcpServers: {} }, true],
    [{ servers: {}, inputs: [] }, true],
    [{ tools: [] }, false],
    [{ server: { name: 'docs', version: '1.0.0' }, tools: [] }, false],
    [[{ name: 'search' }], false],
  ])('%j is %s', (json, expected) => {
    expect(isHostConfig(json)).toBe(expected);
  });
});

describe('readHostConfig', () => {
  test('reads stdio and HTTP servers from mcpServers, as Claude Code writes them', () => {
    const servers = readHostConfig(
      {
        mcpServers: {
          docs: { command: 'node', args: ['server.js', '--read-only'], env: { LEVEL: 'debug' } },
          remote: { type: 'http', url: 'https://example.com/mcp?key=s3cret', headers: { A: 'b' } },
        },
      },
      file,
    );
    expect(servers).toEqual([
      {
        name: 'docs',
        shown: 'node',
        connect: {
          stdio: {
            command: 'node',
            args: ['server.js', '--read-only'],
            cwd: project,
            env: { LEVEL: 'debug' },
            label: 'node',
          },
        },
        unexpanded: [],
      },
      {
        name: 'remote',
        shown: 'https://example.com/mcp',
        connect: { http: { url: 'https://example.com/mcp?key=s3cret', headers: { A: 'b' } } },
        unexpanded: [],
      },
    ]);
  });

  test('expands ${NAME}, ${NAME:-default} and ${env:NAME}, and the folders hosts fill in', () => {
    const [server] = readHostConfig(
      {
        mcpServers: {
          docs: {
            command: '${userHome}${pathSeparator}bin${pathSeparator}docs',
            args: ['${workspaceFolder}/docs', '--level=${LEVEL:-info}', '--region=${REGION:-}'],
            env: { TOKEN: '${TOKEN}', OTHER: '${env:TOKEN}' },
          },
        },
      },
      file,
      { TOKEN: 't0k3n', REGION: 'eu' },
    );
    expect(server?.connect).toMatchObject({
      stdio: {
        command: `${homedir()}${sep}bin${sep}docs`,
        args: [`${project}/docs`, '--level=info', '--region=eu'],
        env: { TOKEN: 't0k3n', OTHER: 't0k3n' },
      },
    });
    expect(server?.unexpanded).toEqual([]);
  });

  test('passes what it can’t expand as written, and says which', () => {
    const [server] = readHostConfig(
      {
        servers: {
          search: {
            type: 'http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer ${input:api-key}', 'X-Team': '${TEAM}' },
          },
        },
      },
      file,
      {},
    );
    expect(server?.connect).toEqual({
      http: {
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer ${input:api-key}', 'X-Team': '${TEAM}' },
      },
    });
    expect(server?.unexpanded).toEqual(['${input:api-key}', '${TEAM}']);
  });

  test('reads VS Code’s servers: cwd, envFile, and env values that are numbers or null', () => {
    const vscode = join(project, '.vscode');
    mkdirSync(join(project, 'tools'), { recursive: true });
    mkdirSync(vscode, { recursive: true });
    writeFileSync(join(project, '.env'), 'TOKEN=from-file\nLEVEL=warn\n');
    const [server] = readHostConfig(
      {
        servers: {
          docs: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
            cwd: '${workspaceFolder}/tools',
            envFile: '${workspaceFolder}/.env',
            env: { LEVEL: 'debug', PORT: 3000, UNSET: null },
          },
        },
      },
      join(vscode, 'mcp.json'),
    );
    // The workspace is the folder above .vscode, and env wins over envFile.
    expect(server?.connect).toMatchObject({
      stdio: {
        cwd: join(project, 'tools'),
        env: { TOKEN: 'from-file', LEVEL: 'debug', PORT: '3000' },
      },
    });
  });

  test('skips a server the config turns off, or one with no command or url', () => {
    const servers = readHostConfig(
      {
        mcpServers: {
          off: { command: 'node', args: ['x.js'], disabled: true },
          empty: {},
          missing: { command: 'node', envFile: 'nowhere.env' },
        },
      },
      file,
    );
    expect(servers.map(({ name, connect }) => [name, connect])).toEqual([
      ['off', { skip: 'the config turns it off.' }],
      ['empty', { skip: 'it has neither a command nor a url.' }],
      ['missing', { skip: `its envFile, ${join(project, 'nowhere.env')}, isn’t there.` }],
    ]);
  });

  test('names each field that isn’t in a shape a host writes', () => {
    expect(() =>
      readHostConfig({ mcpServers: { docs: { command: 'node', args: 'server.js' } } }, file),
    ).toThrow(
      new SnapshotError(
        `${file}: Not an MCP config onmcp can read:\n  mcpServers.docs.args: Invalid input: expected array, received string`,
      ),
    );
  });
});
