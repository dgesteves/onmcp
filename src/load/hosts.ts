import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';

import { z } from 'zod';

import { SnapshotError } from './file.js';
import type { HttpServer, StdioServer } from './server.js';

/** A server in a host's config, as onmcp starts it or connects to it. */
export interface HostServer {
  name: string;
  /** How a report names it: its command, or its URL without the query. Args, env and headers can hold a token. */
  shown: string;
  /** How to reach it, or why onmcp doesn't: the config turns it off, or it has no command or url. */
  connect: { stdio: StdioServer } | { http: HttpServer } | { skip: string };
  /** The ${...} references onmcp passed as written: a variable that isn't set, or a host's prompt. */
  unexpanded: string[];
}

// The shapes hosts write. Claude Code, Claude Desktop and Cursor use mcpServers; VS Code uses
// servers, where env values can be numbers or null. Keys a host adds that onmcp doesn't read pass.
const entry = z.looseObject({
  type: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  envFile: z.string().optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  disabled: z.boolean().optional(),
});
const servers = z.record(z.string(), entry);

/** Whether parsed JSON is a host's MCP config, with mcpServers or servers, not a listing. */
export function isHostConfig(json: unknown): boolean {
  return isObject(json) && (isObject(json.mcpServers) || isObject(json.servers));
}

/**
 * The servers in a host's MCP config, as the host would start them: ${...} references expanded
 * from the environment, and stdio servers started in the workspace (the folder the config is in,
 * or above .vscode or .cursor) unless they set cwd. A reference onmcp can't expand, such as an
 * unset variable or VS Code's ${input:...}, is passed as written, as Claude Code passes an unset
 * one, and the server says which.
 */
export function readHostConfig(
  json: unknown,
  file: string,
  env: Record<string, string | undefined> = process.env,
): HostServer[] {
  const key = isObject(json) && 'mcpServers' in json ? 'mcpServers' : 'servers';
  const parsed = servers.safeParse(isObject(json) ? json[key] : undefined);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  ${[key, ...issue.path].join('.')}: ${issue.message}`,
    );
    throw new SnapshotError(`${file}: Not an MCP config onmcp can read:\n${issues.join('\n')}`);
  }
  const folder = dirname(resolve(file));
  const workspace = ['.vscode', '.cursor'].includes(basename(folder)) ? dirname(folder) : folder;

  return Object.entries(parsed.data).map(([name, server]): HostServer => {
    const unexpanded = new Set<string>();
    const expand = (text: string) =>
      text.replace(/\$\{([^}]+)\}/g, (reference, inner: string) => {
        const value = lookup(inner, env, workspace);
        if (value === undefined) unexpanded.add(reference);
        return value ?? reference;
      });
    const expandAll = (record: Record<string, string>) =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key, expand(value)]));
    const result = (shown: string, connect: HostServer['connect']): HostServer => ({
      name,
      shown,
      connect,
      unexpanded: [...unexpanded],
    });

    if (server.disabled === true) return result('', { skip: 'the config turns it off.' });
    if (server.command !== undefined) {
      const command = expand(server.command);
      const args = (server.args ?? []).map(expand);
      const cwd = resolve(workspace, expand(server.cwd ?? '.'));
      const values: Record<string, string> = {};
      if (server.envFile !== undefined) {
        const envFile = resolve(workspace, expand(server.envFile));
        if (!existsSync(envFile)) {
          return result(command, { skip: `its envFile, ${envFile}, isn’t there.` });
        }
        Object.assign(values, parseEnv(readFileSync(envFile, 'utf8')));
      }
      for (const [key, value] of Object.entries(server.env ?? {})) {
        if (value !== null) values[key] = expand(String(value));
      }
      const stdio: StdioServer = { command, args, cwd, env: values, label: command };
      return result(command, { stdio });
    }
    if (server.url !== undefined) {
      const url = expand(server.url);
      const headers = expandAll(server.headers ?? {});
      return result(URL.canParse(url) ? withoutQuery(url) : url, { http: { url, headers } });
    }
    return result('', { skip: 'it has neither a command nor a url.' });
  });
}

// What a ${...} reference stands for: an environment variable, as ${NAME}, ${NAME:-default} or
// ${env:NAME}, or one of the folders and separators hosts fill in. undefined when onmcp can't say.
function lookup(
  inner: string,
  env: Record<string, string | undefined>,
  workspace: string,
): string | undefined {
  if (inner === 'workspaceFolder') return workspace;
  if (inner === 'userHome') return homedir();
  if (inner === 'pathSeparator') return sep;
  if (inner.startsWith('env:')) return env[inner.slice(4)];
  const withDefault = /^([A-Za-z_]\w*):-(.*)$/s.exec(inner);
  if (withDefault) return env[withDefault[1] ?? ''] ?? withDefault[2];
  return /^[A-Za-z_]\w*$/.test(inner) ? env[inner] : undefined;
}

// Without the query or user info, which can hold a token: reports end up in CI logs.
function withoutQuery(url: string): string {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
