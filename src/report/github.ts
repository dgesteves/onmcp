import type { LintResult } from '../lint.js';
import { label, lineOf } from './target.js';

export interface GithubOptions {
  /**
   * The snapshot file that was checked, as a path from the repository's root and its text: each
   * annotation then goes on the line where its tool, prompt, resource or template is.
   */
  file?: { path: string; text: string };
}

/**
 * Formats a lint result as GitHub Actions workflow commands, one `::error` or `::warning` a
 * problem, which GitHub shows as annotations on the run and, for a file, on the pull request's
 * diff. Everything a server wrote is escaped, so a name with a line break in it can't start a
 * workflow command of its own.
 */
export function formatGithub(result: LintResult, { file }: GithubOptions = {}): string {
  return result.problems
    .map((problem) => {
      const properties = [
        ...(file
          ? [`file=${property(file.path)}`, `line=${lineOf(problem.target, file.text)}`]
          : []),
        `title=${property(`${problem.rule}: ${label(problem.target)}`)}`,
      ];
      const message = [problem.message, problem.fix].filter(Boolean).join(' ');
      return `::${problem.severity} ${properties.join(',')}::${data(message)}\n`;
    })
    .join('');
}

// The escapes the Actions runner reads back: in a message, and in a property, which ends at a
// comma and whose name ends at a colon.
function data(text: string): string {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function property(text: string): string {
  return data(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}
