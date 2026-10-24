// A stdio MCP server for the tests, written by hand so they control every byte it sends. It lists
// what the JSON file in argv[2] holds ({ serverInfo, instructions, capabilities, tools, prompts,
// resources }), in pages of two. --crash writes to stderr and exits before it answers, and
// --silent never answers.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { answer } from './answer.mjs';

const [file, mode] = process.argv.slice(2);
const listing = JSON.parse(readFileSync(file, 'utf8'));

if (mode === '--crash') {
  process.stderr.write('Starting docs server\nError: DOCS_TOKEN is not set\n');
  process.exit(1);
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (mode === '--silent') return;
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, ...answer(listing, method, params) })}\n`,
  );
});
