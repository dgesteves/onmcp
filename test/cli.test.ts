import { describe, expect, test } from 'vitest';

import { EXIT, main } from '../src/cli.js';
import { VERSION } from '../src/version.js';

const fixture = (name: string) => new URL(`fixtures/${name}`, import.meta.url).pathname;

async function cli(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    color: false,
  });
  return { code, stdout, stderr };
}

describe('onmcp check', () => {
  test('exits 0 and says so for a snapshot with no problems', async () => {
    const { code, stdout } = await cli('check', fixture('docs-server.json'));
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe('✔ No problems in 2 tools\n');
  });

  test('exits 1 and prints each problem when there are errors', async () => {
    const { code, stdout } = await cli('check', fixture('undescribed.json'));
    expect(code).toBe(EXIT.problems);
    expect(stdout).toContain('  tool sync\n  ✖ tool-description  The tool has no description.');
    expect(stdout).toContain('✖ 1 problem (1 error, 0 warnings) in 2 tools');
  });

  test('exits 2 when the snapshot can’t be read', async () => {
    const { code, stderr } = await cli('check', fixture('missing.json'));
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/^onmcp: ENOENT/);
  });
});

describe('onmcp', () => {
  test('--version prints the version', async () => {
    expect(await cli('--version')).toEqual({ code: EXIT.ok, stdout: `${VERSION}\n`, stderr: '' });
  });

  test('--help prints the usage', async () => {
    const { code, stdout } = await cli('--help');
    expect(code).toBe(EXIT.ok);
    expect(stdout).toMatch(/^Usage: onmcp check <snapshot.json>/);
  });

  test.each([[[]], [['check']], [['check', 'a.json', 'b.json']]])(
    'prints the usage and exits 2 for %j',
    async (argv) => {
      const { code, stderr } = await cli(...argv);
      expect(code).toBe(EXIT.usage);
      expect(stderr).toMatch(/^Usage:/);
    },
  );

  test('names an unknown command or option', async () => {
    expect((await cli('lint', 'a.json')).stderr).toMatch(/^Unknown command "lint"\./);
    const { code, stderr } = await cli('check', '--frmat', 'json');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/--frmat/);
  });
});
