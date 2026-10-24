import type { Report, Rule } from '../types.js';

// Placeholders other template syntaxes write, which a URI template reads as text: Express's /:id,
// <id>, and Next.js's [id]. :id and [id] only where a path segment starts, so http://host:8080 and
// http://[::1] aren't; a URI can't hold "<" anywhere.
const PLACEHOLDERS: readonly RegExp[] = [
  /(?<=\/):([A-Za-z_]\w*)(?=$|[/?#.])/g,
  /<([A-Za-z_][\w-]*)>/g,
  /(?<=\/)\[([A-Za-z_][\w-]*)\](?=$|[/?#.])/g,
];

const UNCLOSED = {
  message:
    'The URI template has a "{" that doesn’t close: the MCP SDK can’t parse it ("Unclosed template expression"), so a client can’t read anything from it.',
  fix: 'Close the variable with "}", as in {path}.',
};

/**
 * A client reads a template by filling in the variables in its braces (RFC 6570). A brace that
 * doesn't close or isn't opened, or a placeholder in another syntax, leaves it nothing to fill in:
 * the MCP SDK refuses a "{" with no "}" after it, and reads `{repo/{path}` as one variable.
 */
export const uriTemplate: Rule = {
  name: 'uri-template',
  description: 'A resource template’s variables are in {braces}, and each brace closes.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const template of snapshot.resourceTemplates) {
      const target = {
        kind: 'resource-template',
        uriTemplate: template.uriTemplate,
        path: 'uriTemplate',
      } as const;
      const { problem, literals } = scan(template.uriTemplate);
      if (problem) report({ target, ...problem });
      for (const text of literals) {
        for (const pattern of PLACEHOLDERS) {
          for (const [placeholder, name = ''] of text.matchAll(pattern)) {
            report({
              target,
              message: `The URI template has "${placeholder}", which a URI template reads as text: a client can’t fill in "${name}", and reads it as written.`,
              fix: `Write it as {${name}}.`,
            });
          }
        }
      }
    }
  },
};

/** The first brace that doesn't close or isn't opened, and the text outside the variables. */
function scan(template: string): { problem?: Omit<Report, 'target'>; literals: string[] } {
  const literals: string[] = [];
  let start = 0;
  let open = -1;
  // By UTF-16 index, as slice() counts: braces are ASCII.
  for (let index = 0; index < template.length; index++) {
    const character = template.charAt(index);
    if (character === '{' && open !== -1) {
      // The MCP SDK reads from the first "{" to the next "}", whatever is between.
      const close = template.indexOf('}', index);
      if (close === -1) return { problem: UNCLOSED, literals };
      const variable = template.slice(open + 1, close);
      return {
        problem: {
          message: `The URI template has a "{" that doesn’t close before the next one: a client reads "{${variable}}" as one variable, named "${variable}".`,
          fix: 'Close each variable with "}" before the next "{".',
        },
        literals,
      };
    }
    if (character === '{') {
      literals.push(template.slice(start, index));
      open = index;
    } else if (character === '}' && open === -1) {
      return {
        problem: {
          message:
            'The URI template has a "}" that no "{" opens: it stays in every URI, which can’t hold one.',
          fix: 'Take it out, or open the variable with "{".',
        },
        literals: [...literals, template.slice(start, index)],
      };
    } else if (character === '}') {
      open = -1;
      start = index + 1;
    }
  }
  if (open !== -1) return { problem: UNCLOSED, literals };
  return { literals: [...literals, template.slice(start)] };
}
