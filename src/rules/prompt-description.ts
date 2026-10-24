import type { Rule } from '../types.js';

/**
 * A host lists a server's prompts for a person to pick, often as slash commands, and asks them for
 * each argument. With no description they have only the names to go on: they pass over the prompt
 * they needed, or fill in an argument in a form the prompt can't use.
 */
export const promptDescription: Rule = {
  name: 'prompt-description',
  description: 'Every prompt, and each of its arguments, has a description.',
  severity: 'warning',
  check({ snapshot, report }) {
    for (const prompt of snapshot.prompts) {
      if (!prompt.description?.trim()) {
        report({
          target: { kind: 'prompt', name: prompt.name, path: 'description' },
          message:
            prompt.description === undefined
              ? 'The prompt has no description.'
              : 'The description is empty.',
          fix: 'Say what the prompt does and when to use it, in a sentence or two.',
        });
      }
      for (const [index, argument] of (prompt.arguments ?? []).entries()) {
        if (argument.description?.trim()) continue;
        report({
          target: { kind: 'prompt', name: prompt.name, path: `arguments.${index}` },
          message: `"${argument.name}" has no description: a person fills it in from its name alone.`,
          fix: `Say what "${argument.name}" is, with an example value.`,
        });
      }
    }
  },
};
