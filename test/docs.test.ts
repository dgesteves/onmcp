import { expect, test } from 'vitest';

import { ruleDocs } from '../src/docs.js';
import { rules } from '../src/rules/index.js';

test.each(rules.map((rule) => rule.name))('reads the docs page of %s', async (name) => {
  expect(await ruleDocs(name)).toMatch(new RegExp(`^# ${name}\n`));
});

test.each(['../../package', 'param-description.md', '/etc/hosts', ''])(
  'reads nothing for %j, which isn’t a rule’s name',
  async (name) => {
    await expect(ruleDocs(name)).rejects.toThrow(`"${name}" isn’t a rule’s name.`);
  },
);
