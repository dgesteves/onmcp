import type { Rule } from '../types.js';

// Words that, in a tool's name, say it deletes or overwrites something. "del" isn't one: it's a
// word in Spanish and Portuguese names, such as precio_del_producto.
const DESTRUCTIVE = new Set([
  'delete',
  'remove',
  'rm',
  'drop',
  'destroy',
  'purge',
  'wipe',
  'erase',
  'truncate',
  'overwrite',
  'kill',
  'terminate',
  'revoke',
  'uninstall',
]);

/**
 * A host reads a tool's annotations to decide whether to ask the user before calling it: a tool
 * that says it only reads, or that it doesn't destroy anything, can be run without asking. An
 * annotation that the tool's name contradicts lets a host run a delete unasked, by mistake or by
 * design, and two that contradict each other leave the host to guess.
 */
export const toolAnnotations: Rule = {
  name: 'tool-annotations',
  description:
    'A tool’s annotations agree with each other, and none says a tool named for deleting is safe.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      const { readOnlyHint, destructiveHint } = tool.annotations ?? {};
      const target = (hint: string) =>
        ({ kind: 'tool', name: tool.name, path: `annotations.${hint}` }) as const;
      const verb = words(tool.name).find((word) => DESTRUCTIVE.has(word));

      if (readOnlyHint === true && verb !== undefined) {
        report({
          target: target('readOnlyHint'),
          message: `readOnlyHint says the tool only reads, and "${verb}" in its name says it doesn’t: a host can run a read-only tool without asking the user.`,
          fix: 'Set readOnlyHint to false. If the tool really only reads, rename it.',
        });
      } else if (readOnlyHint === true && destructiveHint === true) {
        report({
          target: target('destructiveHint'),
          message:
            'readOnlyHint and destructiveHint are both true: a tool that only reads can’t destroy anything, so a host can’t tell which to trust.',
          fix: 'If the tool changes anything, set readOnlyHint to false. If it only reads, take destructiveHint out.',
        });
      }
      if (readOnlyHint !== true && destructiveHint === false && verb !== undefined) {
        report({
          target: target('destructiveHint'),
          message: `destructiveHint says the tool only adds, and "${verb}" in its name says it doesn’t: a host can skip asking the user before a tool that doesn’t destroy anything.`,
          fix: 'Take destructiveHint out, since true is the default, or set it to true.',
        });
      }
    }
  },
};

// The words of a name in any case: delete_file, deleteFile, files.delete and HTTPDelete.
function words(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/);
}
