import type { Rule } from '../types.js';

const CONSEQUENCE = 'a host keeps one of them, and the model can’t reach the other.';

/**
 * Two tools with one name: a host keeps one of them (which one depends on the host), and the
 * model can't reach the other. The same goes for prompts, and for resources with one URI.
 */
export const uniqueNames: Rule = {
  name: 'unique-names',
  description: 'No two tools or prompts share a name, and no two resources share a URI.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const [tool, first] of repeats(snapshot.tools, (tool) => tool.name)) {
      report({
        target: { kind: 'tool', name: tool.name, path: 'name' },
        message: `Tool ${first + 1} has this name too: ${CONSEQUENCE}`,
        fix: 'Rename one of them.',
      });
    }
    for (const [prompt, first] of repeats(snapshot.prompts, (prompt) => prompt.name)) {
      report({
        target: { kind: 'prompt', name: prompt.name, path: 'name' },
        message: `Prompt ${first + 1} has this name too: ${CONSEQUENCE}`,
        fix: 'Rename one of them.',
      });
    }
    for (const [resource, first] of repeats(snapshot.resources, (resource) => resource.uri)) {
      report({
        target: { kind: 'resource', uri: resource.uri, path: 'uri' },
        message: `Resource ${first + 1} has this URI too: ${CONSEQUENCE}`,
        fix: 'Give each resource its own URI.',
      });
    }
  },
};

// Each item after the first with the same key, with the position of the first.
function* repeats<T>(items: readonly T[], key: (item: T) => string): Generator<[T, number]> {
  const first = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const position = first.get(key(item));
    if (position === undefined) first.set(key(item), index);
    else yield [item, position];
  }
}
