import type { Rule } from '../types.js';
import { estimateTokens } from '../util/tokens.js';

/**
 * A host sends every tool's description to the model with each request, whether it calls the tool
 * or not, so a long one costs its tokens on every turn. Past a few paragraphs, it also buries what
 * the model reads it for: what the tool does, and when to call it.
 */
export const descriptionBudget: Rule<{ maxTokens: number }> = {
  name: 'description-budget',
  description:
    'A tool’s description fits in maxTokens (500 by default): a model reads it every turn.',
  severity: 'warning',
  defaults: { maxTokens: 500 },
  check({ snapshot, options, report }) {
    for (const tool of snapshot.tools) {
      if (tool.description === undefined) continue;
      const tokens = estimateTokens(tool.description);
      if (tokens <= options.maxTokens) continue;
      report({
        target: { kind: 'tool', name: tool.name, path: 'description' },
        message: `The description is about ${tokens.toLocaleString('en')} tokens, over the budget of ${options.maxTokens.toLocaleString('en')}: a host sends it to the model with every request, whether it calls the tool or not.`,
        fix: 'Keep what the model needs to choose the tool and call it. Move reference material into a resource, or into what the tool returns.',
      });
    }
  },
};
