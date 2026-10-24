import type { Rule, Target } from '../types.js';
import { strings } from '../util/strings.js';

interface Kind {
  patterns: RegExp[];
  /** What the phrase does, after "which". */
  does: string;
  fix: string;
}

// Each kind of phrase, with the patterns that find it. They're matched on lowercase text with
// format characters (zero-width, bidi, tags) taken out and whitespace collapsed, so "ig<U+200B>nore"
// and "Ignore\n  previous" match too. hidden-characters reports the format characters themselves.
const KINDS: Record<'override' | 'conceal' | 'markup', Kind> = {
  override: {
    patterns: [
      /\b(?:ignore|disregard|forget|override)\s+(?:(?:all|any|the|your|of)\s+)*(?:previous|prior|above|earlier|preceding|other|system|original)\s+(?:instructions?|prompts?|messages?|rules|guidelines|directions)\b/,
      /\bfrom\s+now\s+on,?\s+you\s+(?:must|will|should|are)\b/,
      /\byou\s+are\s+no\s+longer\b/,
      /\bnew\s+(?:system\s+)?instructions\s*:/,
    ],
    does: 'tells the model to drop the instructions it was given',
    fix: 'Describe what the tool does, not how the model should behave: the model’s instructions come from the user and the host.',
  },
  conceal: {
    patterns: [
      /\b(?:do\s+not|don['’]t|never)\s+(?:tell|inform|mention|reveal|notify|alert)\s+(?:(?:this|it|anything|about\s+this)\s+)?(?:to\s+)?the\s+user\b/,
      /\bwithout\s+(?:telling|informing|notifying|alerting)\s+the\s+user\b/,
      /\bthe\s+user\s+(?:must|should)\s+(?:not|never)\s+(?:know|see|find\s+out|be\s+told)\b/,
      /\bkeep\s+(?:this|it)\s+(?:secret|hidden|confidential)\s+from\b/,
    ],
    does: 'tells the model to hide something from the user',
    fix: 'Remove it: a tool doesn’t decide what the user is told.',
  },
  markup: {
    patterns: [
      /<\s*\/?\s*(?:important|system|admin|secret)\s*>/,
      /\[\s*\/?\s*(?:system|inst)\s*\]/,
      /<\|\s*(?:im_start|im_end|system|endoftext)\s*\|>/,
    ],
    does: 'dresses text up as a system message or an urgent note to the model',
    fix: 'Remove the markup, and write the description as plain text about the tool.',
  },
};

/**
 * A tool's description is text the model trusts. Phrases in it that tell the model to drop its
 * instructions, to hide something from the user, or that dress up as a system message are how a
 * server takes over the agent (tool poisoning). A tool that's honest about what it does needs none.
 */
export const injectionPhrases: Rule = {
  name: 'injection-phrases',
  description:
    'No text that tells the model to drop its instructions, hide things from the user, or poses as a system message.',
  severity: 'error',
  check({ snapshot, report }) {
    const scan = (target: (path: string) => Target, value: unknown) => {
      for (const [path, text] of strings(value, '')) {
        const normalized = normalize(text);
        for (const kind of Object.values(KINDS)) {
          const phrase = first(normalized, kind.patterns);
          if (phrase === undefined) continue;
          const label = path.includes('.') ? path : `The ${path}`;
          report({
            target: target(path),
            message: `${label} says "${phrase}", which ${kind.does}.`,
            fix: kind.fix,
          });
        }
      }
    };
    scan((path) => ({ kind: 'server', path }), {
      ...(snapshot.instructions !== undefined && { instructions: snapshot.instructions }),
    });
    for (const tool of snapshot.tools) {
      scan((path) => ({ kind: 'tool', name: tool.name, path }), tool);
    }
    for (const prompt of snapshot.prompts) {
      scan((path) => ({ kind: 'prompt', name: prompt.name, path }), prompt);
    }
    for (const resource of snapshot.resources) {
      scan((path) => ({ kind: 'resource', uri: resource.uri, path }), resource);
    }
    for (const template of snapshot.resourceTemplates) {
      const { uriTemplate } = template;
      scan((path) => ({ kind: 'resource-template', uriTemplate, path }), template);
    }
  },
};

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function first(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return undefined;
}
