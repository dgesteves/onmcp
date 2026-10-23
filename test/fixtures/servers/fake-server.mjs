// A stdio MCP server for the tests, written by hand so they control every byte it sends. It lists
// what the JSON file in argv[2] holds ({ serverInfo, instructions, capabilities, tools, prompts,
// resources }), in pages of two. --crash writes to stderr and exits before it answers, and
// --silent never answers.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [file, mode] = process.argv.slice(2);
const listing = JSON.parse(readFileSync(file, 'utf8'));

if (mode === '--crash') {
  process.stderr.write('Starting docs server\nError: DOCS_TOKEN is not set\n');
  process.exit(1);
}

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const page = (items, cursor) => {
  const start = Number(cursor ?? 0);
  const next = start + 2 < items.length ? String(start + 2) : undefined;
  return { items: items.slice(start, start + 2), ...(next && { nextCursor: next }) };
};

createInterface({ input: process.stdin }).on('line', (line) => {
  if (mode === '--silent') return;
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  if (method === 'initialize') {
    send({
      id,
      result: {
        protocolVersion: params.protocolVersion,
        capabilities: listing.capabilities ?? { tools: {} },
        serverInfo: listing.serverInfo ?? { name: 'fake', version: '1.0.0' },
        ...(listing.instructions && { instructions: listing.instructions }),
      },
    });
    return;
  }
  for (const kind of ['tools', 'prompts', 'resources']) {
    if (method === `${kind}/list`) {
      const { items, nextCursor } = page(listing[kind] ?? [], params?.cursor);
      send({ id, result: { [kind]: items, ...(nextCursor && { nextCursor }) } });
      return;
    }
  }
  send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
});
