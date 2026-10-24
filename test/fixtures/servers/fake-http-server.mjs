// A Streamable HTTP MCP server for the tests, written by hand like fake-server.mjs. It answers at
// /mcp with what a JSON file holds, gives the client a session ID, and keeps the method and headers
// of each request it gets, so the tests can see what onmcp sent. Run on its own with the JSON file
// and a port (0 for any), it prints its URL once it listens.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { answer } from './answer.mjs';

export const SESSION_ID = 'fake-session';

/**
 * @param {object} listing { serverInfo, instructions, capabilities, tools, prompts, resources }
 * @param {{ token?: string, html?: boolean, silent?: boolean }} [options] token: answer 401 to a
 *   request without it as a Bearer token. html: answer with a web page. silent: never answer.
 */
export function fakeHttpServer(listing, options = {}) {
  /** @type {{ method: string | undefined, headers: import('node:http').IncomingHttpHeaders }[]} */
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, headers: req.headers });
    if (options.silent) return;
    if (options.html) {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Docs</title>');
      return;
    }
    if (options.token && req.headers.authorization !== `Bearer ${options.token}`) {
      res.writeHead(401, { 'www-authenticate': 'Bearer' }).end();
      return;
    }
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/mcp') {
      res.writeHead(404).end('Not Found');
      return;
    }
    // A GET opens a stream for messages the server starts, and this one never starts any.
    if (req.method === 'GET') {
      res.writeHead(405).end();
      return;
    }
    const { id, method, params } = req.method === 'POST' ? JSON.parse(body) : {};
    // The DELETE that ends the session, and notifications, have nothing to answer.
    if (id === undefined) {
      res.writeHead(202).end();
      return;
    }
    res
      .writeHead(200, {
        'content-type': 'application/json',
        ...(method === 'initialize' && { 'mcp-session-id': SESSION_ID }),
      })
      .end(JSON.stringify({ jsonrpc: '2.0', id, ...answer(listing, method, params) }));
  });
  return { server, requests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, port] = process.argv.slice(2);
  const { server } = fakeHttpServer(JSON.parse(readFileSync(file, 'utf8')));
  server.listen(Number(port), '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${server.address().port}/mcp`);
  });
}
