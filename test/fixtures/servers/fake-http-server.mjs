// A Streamable HTTP MCP server for the tests, written by hand like fake-server.mjs. It answers at
// /mcp with what a JSON file holds, gives the client a session ID, and keeps the method and headers
// of each request it gets, so the tests can see what onmcp sent. With `legacy`, it speaks the
// HTTP+SSE transport from before Streamable HTTP instead, at /sse. Run on its own with the JSON file
// and a port (0 for any), it prints its URL once it listens.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { answer } from './answer.mjs';

export const SESSION_ID = 'fake-session';

/**
 * @param {object} listing { serverInfo, instructions, capabilities, tools, prompts, resources }
 * @param {{ token?: string, html?: boolean, silent?: boolean, legacy?: boolean }} [options]
 *   token: answer 401 to a request without it as a Bearer token. html: answer with a web page.
 *   silent: never answer. legacy: speak HTTP+SSE.
 */
export function fakeHttpServer(listing, options = {}) {
  /** @type {{ method: string | undefined, headers: import('node:http').IncomingHttpHeaders }[]} */
  const requests = [];
  /** @type {import('node:http').ServerResponse | undefined} */
  let stream;
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
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    // HTTP+SSE: a GET to /sse opens an event stream whose first event names the URL to POST
    // messages to, and the answers come back on the stream. A POST to /sse is the Streamable HTTP
    // client's first try, and a legacy server doesn't take it.
    if (options.legacy) {
      if (req.method === 'GET' && pathname === '/sse') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: endpoint\ndata: /messages\n\n');
        stream = res;
      } else if (req.method === 'POST' && pathname === '/messages' && stream) {
        res.writeHead(202).end();
        const { id, method, params } = JSON.parse(body);
        if (id === undefined) return;
        const message = { jsonrpc: '2.0', id, ...answer(listing, method, params) };
        stream.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      } else {
        res.writeHead(405).end();
      }
      return;
    }
    if (pathname !== '/mcp') {
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
