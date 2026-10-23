import type { Rule } from '../types.js';

/**
 * A model chooses a tool by its name and description: with no description it guesses from the
 * name, and calls the tool when it shouldn't, or misses it when it should.
 */
export const toolDescription: Rule = {
  name: 'tool-description',
  description: 'Every tool has a description.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      if (tool.description?.trim()) continue;
      report({
        target: { kind: 'tool', name: tool.name, path: 'description' },
        message:
          tool.description === undefined
            ? 'The tool has no description.'
            : 'The description is empty.',
        fix: 'Say what the tool does and when to call it, in a sentence or two.',
      });
    }
  },
};
