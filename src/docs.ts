import { readFile } from 'node:fs/promises';

// docs/ sits beside src/ in the repository and beside dist/ in the package, so the same path finds
// it from both.
const RULES = new URL('../docs/rules/', import.meta.url);

/** A rule's docs page, in Markdown: why it matters, examples, and the fix. */
export function ruleDocs(name: string): Promise<string> {
  // Only a rule's kebab-case name, so no name can reach a file outside docs/rules.
  if (!/^[a-z]+(-[a-z]+)*$/.test(name)) {
    return Promise.reject(new Error(`"${name}" isn’t a rule’s name.`));
  }
  return readFile(new URL(`${name}.md`, RULES), 'utf8');
}
