// How the fake servers answer a request, over stdio and HTTP alike: initialize with the server's
// info, capabilities and instructions from the JSON file, and each list in pages of two.

const page = (items, cursor) => {
  const start = Number(cursor ?? 0);
  const next = start + 2 < items.length ? String(start + 2) : undefined;
  return { items: items.slice(start, start + 2), ...(next && { nextCursor: next }) };
};

/** The result or the error for a request, without the JSON-RPC envelope. */
export function answer(listing, method, params) {
  if (method === 'initialize') {
    return {
      result: {
        protocolVersion: params.protocolVersion,
        capabilities: listing.capabilities ?? { tools: {} },
        serverInfo: listing.serverInfo ?? { name: 'fake', version: '1.0.0' },
        ...(listing.instructions && { instructions: listing.instructions }),
      },
    };
  }
  for (const kind of ['tools', 'prompts', 'resources']) {
    if (method === `${kind}/list`) {
      const { items, nextCursor } = page(listing[kind] ?? [], params?.cursor);
      return { result: { [kind]: items, ...(nextCursor && { nextCursor }) } };
    }
  }
  // The error in templatesError, or the templates when the file has them: like many servers with
  // resources, it has no handler otherwise.
  if (method === 'resources/templates/list' && listing.templatesError) {
    return { error: listing.templatesError };
  }
  if (method === 'resources/templates/list' && listing.resourceTemplates) {
    const { items, nextCursor } = page(listing.resourceTemplates, params?.cursor);
    return { result: { resourceTemplates: items, ...(nextCursor && { nextCursor }) } };
  }
  return { error: { code: -32601, message: `Method not found: ${method}` } };
}
