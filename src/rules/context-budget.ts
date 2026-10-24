import type { Rule } from '../types.js';
import { estimateTokens } from '../util/tokens.js';

/**
 * A host sends the model the server's instructions and every tool's name, description and input
 * schema with each request, before the user's message. A server can cost a lot with every
 * description short, in its schemas or in its number of tools, and what it takes is context the
 * model doesn't have for the user's task. Prompts and resources aren't counted: a host lists them
 * for the user to pick from.
 */
export const contextBudget: Rule<{ maxTokens: number }> = {
  name: 'context-budget',
  description:
    'The server’s instructions and tools fit in maxTokens (10,000 by default) of the model’s context.',
  severity: 'warning',
  defaults: { maxTokens: 10_000 },
  check({ snapshot, options, report }) {
    const costs = snapshot.tools.map((tool) => ({
      label: tool.name,
      tokens: estimateTokens(
        JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }),
      ),
    }));
    if (snapshot.instructions) {
      costs.push({ label: 'the instructions', tokens: estimateTokens(snapshot.instructions) });
    }
    const total = costs.reduce((sum, cost) => sum + cost.tokens, 0);
    if (total <= options.maxTokens) return;

    const { length } = snapshot.tools;
    const tools = length === 1 ? 'tool' : `${length} tools`;
    const what =
      length === 0
        ? 'instructions are'
        : snapshot.instructions
          ? `${tools} and instructions are`
          : `${tools} ${length === 1 ? 'is' : 'are'}`;
    const largest = [...costs]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 3)
      .map((cost) => `${cost.label} (${format(cost.tokens)})`)
      .join(', ');
    report({
      target: { kind: 'server' },
      message: `The server’s ${what} about ${format(total)} tokens, over the budget of ${format(options.maxTokens)}: a host sends those tokens to the model with every request.${costs.length > 1 ? ` The largest: ${largest}.` : ''}`,
      fix: 'Trim the largest first. With many tools, merge the ones that do nearly the same thing, or split the server so a host loads only what it needs.',
    });
  },
};

function format(tokens: number): string {
  return tokens.toLocaleString('en');
}
