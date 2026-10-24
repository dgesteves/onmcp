import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { EXIT, main } from '../src/cli.js';
import type { JsonReport } from '../src/report/json.js';
import type { JsonServersReport } from '../src/report/servers.js';
import type { SarifLog } from '../src/report/sarif.js';
import type { ServeOptions } from '../src/serve.js';
import { VERSION } from '../src/version.js';
import { fakeHttpServer } from './fixtures/servers/fake-http-server.mjs';

const fixture = (name: string) => new URL(`fixtures/${name}`, import.meta.url).pathname;
const listing = JSON.parse(readFileSync(fixture('servers/docs.json'), 'utf8')) as object;

async function cli(...argv: string[]) {
  return cliIn(process.cwd(), ...argv);
}

/** Runs the CLI as if from the folder, which is where it looks for onmcp.config.json. */
async function cliIn(cwd: string, ...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    color: false,
    cwd,
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

  test('starts the server after -- and checks what it lists', async () => {
    const server = new URL('fixtures/servers/', import.meta.url).pathname;
    const { code, stdout } = await cli(
      'check',
      '--',
      process.execPath,
      `${server}fake-server.mjs`,
      `${server}docs.json`,
    );
    expect(code).toBe(EXIT.problems);
    expect(stdout).toContain('  tool sync\n  ✖ tool-description');
    expect(stdout).toMatch(/in 3 tools, 1 prompt, 1 resource\n$/);
  });

  test('checks a server’s resource templates', async () => {
    const { code, stdout } = await cli(
      'check',
      '--',
      process.execPath,
      fixture('servers/fake-server.mjs'),
      fixture('servers/files.json'),
    );
    // Its diff template has no description: a warning, so it still passes.
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain(
      '  resource template git://diff/{base}...{head}\n  ⚠ resource-description  The template has no description',
    );
    expect(stdout).toMatch(
      /\(0 errors, 1 warning\) in 0 tools, 1 resource, 3 resource templates\n$/,
    );
  });

  test('checks the server at a URL, with each --header', async () => {
    const { server } = fakeHttpServer(listing, { token: 'secret' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const { code, stdout } = await cli(
        'check',
        `http://127.0.0.1:${port}/mcp`,
        '-H',
        'Authorization: Bearer secret',
      );
      expect(code).toBe(EXIT.problems);
      expect(stdout).toMatch(/in 3 tools, 1 prompt, 1 resource\n$/);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test('passes options after -- to the server, not to onmcp', async () => {
    const { code, stderr } = await cli(
      'check',
      '--timeout',
      '0.2',
      '--',
      'onmcp-no-such-command',
      '--help',
    );
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe(
      'onmcp: Couldn’t list what `onmcp-no-such-command --help` has: the command wasn’t found.\n',
    );
  });

  test('passes with warnings alone, up to --max-warnings', async () => {
    expect((await cli('check', fixture('warnings.json'))).code).toBe(EXIT.ok);
    const { code, stderr } = await cli('check', '--max-warnings', '2', fixture('warnings.json'));
    expect(code).toBe(EXIT.ok);
    expect(stderr).toBe('');
  });

  test('exits 1 with more warnings than --max-warnings, and says so on stderr', async () => {
    const { code, stdout, stderr } = await cli(
      'check',
      '--max-warnings',
      '1',
      fixture('warnings.json'),
    );
    expect(code).toBe(EXIT.problems);
    expect(stdout).toMatch(/⚠ 2 problems \(0 errors, 2 warnings\) in 1 tool\n$/);
    expect(stderr).toBe('onmcp: 2 warnings, more than the 1 --max-warnings allows.\n');
  });

  test('keeps --format json readable when it’s over --max-warnings', async () => {
    const { code, stdout } = await cli(
      'check',
      '-f',
      'json',
      '--max-warnings=0',
      fixture('warnings.json'),
    );
    expect(code).toBe(EXIT.problems);
    expect(JSON.parse(stdout)).toMatchObject({ errorCount: 0, warningCount: 2 });
  });

  test('prints JSON with --format json, and exits the same way', async () => {
    const { code, stdout } = await cli('check', '-f', 'json', fixture('undescribed.json'));
    expect(code).toBe(EXIT.problems);
    const report = JSON.parse(stdout) as JsonReport;
    expect(report).toMatchObject({ errorCount: 1, warningCount: 0, checked: { tools: 2 } });
    expect(report.problems.map((problem) => problem.rule)).toEqual(['tool-description']);
  });

  test('prints SARIF with --format sarif, pointing at the snapshot from the folder', async () => {
    const { code, stdout } = await cliIn(
      fixture(''),
      'check',
      '-f',
      'sarif',
      fixture('undescribed.json'),
    );
    expect(code).toBe(EXIT.problems);
    const log = JSON.parse(stdout) as SarifLog;
    expect(log.version).toBe('2.1.0');
    expect(log.runs[0]?.results).toEqual([
      expect.objectContaining({
        ruleId: 'tool-description',
        level: 'error',
        locations: [
          expect.objectContaining({
            physicalLocation: {
              artifactLocation: { uri: 'undescribed.json' },
              region: { startLine: 8 },
            },
          }),
        ],
      }),
    ]);
  });

  test('gives a file outside the folder as a file:// URI', async () => {
    const { stdout } = await cliIn(
      fixture('servers'),
      'check',
      '-f',
      'sarif',
      fixture('undescribed.json'),
    );
    const [result] = (JSON.parse(stdout) as SarifLog).runs[0]?.results ?? [];
    expect(result?.locations[0]?.physicalLocation?.artifactLocation.uri).toBe(
      `file://${fixture('undescribed.json')}`,
    );
  });

  test('prints GitHub annotations with --format github, on the snapshot’s lines', async () => {
    const { code, stdout } = await cliIn(
      fixture(''),
      'check',
      '-f',
      'github',
      fixture('undescribed.json'),
    );
    expect(code).toBe(EXIT.problems);
    expect(stdout).toBe(
      '::error file=undescribed.json,line=8,title=tool-description%3A tool sync::The tool has no description. Say what the tool does and when to call it, in a sentence or two.\n',
    );
  });

  test('prints GitHub annotations without a file for a server', async () => {
    const { stdout } = await cli(
      'check',
      '-f',
      'github',
      '--',
      'node',
      fixture('servers/fake-server.mjs'),
      fixture('servers/docs.json'),
    );
    expect(stdout).toMatch(/^::error title=tool-description%3A tool \w+::/);
  });

  test('writes control characters in an error as code points, and keeps its lines', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'onmcp-'));
    writeFileSync(
      join(folder, 'onmcp.config.json'),
      JSON.stringify({ rules: { 'evil\u001b[2J': 'off' } }),
    );
    const { code, stderr } = await cliIn(folder, 'check', fixture('undescribed.json'));
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/Unknown rule "evil<U\+001B>\[2J" in the config\.\n$/);
  });

  test('reads onmcp.config.json from the folder it runs in', async () => {
    const { code, stdout } = await cliIn(fixture('config'), 'check', fixture('undescribed.json'));
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe('✔ No problems in 2 tools\n');
  });

  test('reads the config --config names', async () => {
    const { code, stdout } = await cli(
      'check',
      '--config',
      fixture('config/onmcp.config.json'),
      fixture('undescribed.json'),
    );
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe('✔ No problems in 2 tools\n');
  });

  test('stops at a config that names an unknown rule, before it reads anything', async () => {
    const file = fixture('config/typo.json');
    const { code, stderr } = await cli('check', '-c', file, '--', 'onmcp-no-such-command');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe(
      `onmcp: ${file}: Unknown rule "tool-descripton" in the config. Did you mean "tool-description"?\n`,
    );
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
    expect(stdout).toMatch(/^Usage: onmcp check \[options\] -- <command> \[args...\]/);
  });

  test.each([['a.json'], ['https://example.com/mcp']])(
    'takes %s or a command, not both',
    async (target) => {
      const { code, stderr } = await cli('check', target, '--', 'node', 'server.js');
      expect(code).toBe(EXIT.usage);
      expect(stderr).toMatch(/^Give a snapshot, a URL or a command after --, not more than one\./);
    },
  );

  test('takes --header only with a URL', async () => {
    const { code, stderr } = await cli('check', '-H', 'X-Team: docs', 'a.json');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe('--header goes with a server’s <url>, not a snapshot or a command.\n');
  });

  test.each(['Authorization Bearer secret', ': secret', 'Bad Name: secret'])(
    'rejects --header %j without echoing it',
    async (header) => {
      const { code, stderr } = await cli('check', '--header', header, 'https://example.com/mcp');
      expect(code).toBe(EXIT.usage);
      expect(stderr).toBe(
        '--header takes "Name: value", such as "Authorization: Bearer <token>".\n',
      );
    },
  );

  test('rejects a --format it doesn’t have', async () => {
    const { code, stderr } = await cli('check', '--format', 'xml', 'a.json');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe('--format takes pretty, json, sarif or github, not "xml".\n');
  });

  test.each(['0', '-1', 'soon'])('rejects --timeout %s', async (timeout) => {
    const { code, stderr } = await cli('check', `--timeout=${timeout}`, 'a.json');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe(`--timeout takes a number of seconds, not "${timeout}".\n`);
  });

  test.each(['-1', '1.5', 'none', ''])('rejects --max-warnings %j', async (limit) => {
    const { code, stderr } = await cli('check', `--max-warnings=${limit}`, 'a.json');
    expect(code).toBe(EXIT.usage);
    expect(stderr).toBe(
      `--max-warnings takes a whole number of warnings, such as 0, not "${limit}".\n`,
    );
  });

  test.each([[[]], [['check']], [['check', 'a.json', 'b.json']], [['check', '--']]])(
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

describe('onmcp serve', () => {
  /** Runs `onmcp serve` with a serve() that records what it was given, instead of taking stdin. */
  async function serve(argv: string[], { cwd = process.cwd(), interactive = false } = {}) {
    const started: ServeOptions[] = [];
    let stderr = '';
    const code = await main(['serve', ...argv], {
      stdout: () => undefined,
      stderr: (text) => (stderr += text),
      color: false,
      cwd,
      interactive,
      serve: (options) => started.push(options),
    });
    return { code, stderr, started };
  }

  test('starts the MCP server in the folder, quietly when an agent runs it', async () => {
    expect(await serve([], { cwd: fixture('config') })).toEqual({
      code: EXIT.ok,
      stderr: '',
      started: [{ cwd: fixture('config') }],
    });
  });

  test('passes on --config', async () => {
    const { started } = await serve(['-c', fixture('config/onmcp.config.json')]);
    expect(started[0]?.config).toBe(fixture('config/onmcp.config.json'));
  });

  test('says it waits for an agent when a person runs it in a terminal', async () => {
    const { code, stderr } = await serve([], { interactive: true });
    expect(code).toBe(EXIT.ok);
    expect(stderr).toMatch(/^onmcp serve is an MCP server: it is waiting for an agent on stdin\./);
  });

  test('doesn’t start with a config it can’t use', async () => {
    const { code, stderr, started } = await serve(['-c', fixture('config/typo.json')]);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/typo\.json: Unknown rule/);
    expect(started).toEqual([]);
  });

  test.each([
    [['tools.json']],
    [['-f', 'json']],
    [['--max-warnings', '0']],
    [['--', 'node', 'x.js']],
  ])('takes nothing but --config: %j', async (argv) => {
    const { code, stderr, started } = await serve(argv);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/^serve takes only --config: the agent says what to check\./);
    expect(started).toEqual([]);
  });
});

describe('onmcp check <host config>', () => {
  const config = fixture('hosts/mcp.json');

  /** A host config of its own, with each server's command given in full. */
  function hostConfig(servers: Record<string, unknown>): string {
    const file = join(mkdtempSync(join(tmpdir(), 'onmcp-host-')), '.mcp.json');
    writeFileSync(file, JSON.stringify({ mcpServers: servers }));
    return file;
  }
  const fake = (listing: string) => ({
    command: process.execPath,
    args: [fixture('servers/fake-server.mjs'), fixture(`servers/${listing}`)],
  });

  test('checks each server in turn, and reports them under their names', async () => {
    const { code, stdout } = await cli('check', config);
    expect(stdout).toContain(
      'docs  node\n  tool sync\n  ✖ tool-description  The tool has no description.',
    );
    expect(stdout).toContain(
      '\n  ✖ 1 problem (1 error, 0 warnings) in 3 tools, 1 prompt, 1 resource\n',
    );
    expect(stdout).toContain('files  node\n  Passed as written: ${ONMCP_TEST_UNSET}\n');
    expect(stdout).toContain(
      'broken  onmcp-no-such-command\n  ✖ Couldn’t list what `onmcp-no-such-command` has: the command wasn’t found.',
    );
    expect(stdout).toContain('off\n  Skipped: the config turns it off.');
    expect(stdout).toMatch(
      /\n✖ 2 problems \(1 error, 1 warning\) in 2 servers\. 1 server couldn’t be checked, and 1 was skipped\.\n$/,
    );
    // A server that couldn't be checked makes it 2, once the others are.
    expect(code).toBe(EXIT.usage);
  });

  test('never prints a server’s args, env or headers, which can hold a token', async () => {
    const { stdout, stderr } = await cli('check', config);
    expect(stdout + stderr).not.toContain('s3cret');
  });

  test('exits 1 with errors, and 0 with warnings alone, when every server was checked', async () => {
    expect((await cli('check', hostConfig({ docs: fake('docs.json') }))).code).toBe(EXIT.problems);
    const files = hostConfig({ files: fake('files.json') });
    expect((await cli('check', files)).code).toBe(EXIT.ok);
    // --max-warnings counts the warnings across every server.
    const { code, stderr } = await cli('check', '--max-warnings', '0', files);
    expect(code).toBe(EXIT.problems);
    expect(stderr).toBe('onmcp: 1 warning, more than the 0 --max-warnings allows.\n');
  });

  test('connects to a server at its url, with its headers’ variables expanded', async () => {
    const { server } = fakeHttpServer(listing, { token: 'secret' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    process.env.ONMCP_TEST_TOKEN = 'secret';
    try {
      const file = hostConfig({
        remote: {
          type: 'http',
          url: `http://127.0.0.1:${port}/mcp?key=s3cret`,
          headers: { Authorization: 'Bearer ${ONMCP_TEST_TOKEN}' },
        },
      });
      const { code, stdout } = await cli('check', file);
      expect(code).toBe(EXIT.problems);
      // Shown without its query, which can hold a token.
      expect(stdout).toMatch(
        new RegExp(`^remote  http://127\\.0\\.0\\.1:${port}/mcp\n  tool sync`),
      );
      expect(stdout).not.toContain('s3cret');
    } finally {
      delete process.env.ONMCP_TEST_TOKEN;
      server.closeAllConnections();
      server.close();
    }
  });

  test('prints each server’s report, or why there isn’t one, with --format json', async () => {
    const { stdout } = await cli('check', '-f', 'json', config);
    const report = JSON.parse(stdout) as JsonServersReport;
    expect(report).toMatchObject({ onmcp: VERSION, errorCount: 1, warningCount: 1 });
    expect(report.servers).toEqual([
      expect.objectContaining({ name: 'docs', unexpanded: [], errorCount: 1, warningCount: 0 }),
      expect.objectContaining({ name: 'files', unexpanded: ['${ONMCP_TEST_UNSET}'] }),
      {
        name: 'broken',
        unexpanded: [],
        error: 'Couldn’t list what `onmcp-no-such-command` has: the command wasn’t found.',
      },
      { name: 'off', unexpanded: [], skipped: 'the config turns it off.' },
    ]);
  });

  test.each(['sarif', 'github'])(
    'rejects --format %s, which describes one server',
    async (format) => {
      const { code, stdout, stderr } = await cli('check', '-f', format, config);
      expect(code).toBe(EXIT.usage);
      expect(stdout).toBe('');
      expect(stderr).toMatch(new RegExp(`^--format ${format} points at one server's listing`));
    },
  );

  test('says which field of a host config it can’t read', async () => {
    const file = hostConfig({ docs: { command: 'node', args: 'server.js' } });
    const { code, stderr } = await cli('check', file);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toMatch(/Not an MCP config onmcp can read:\n {2}mcpServers\.docs\.args:/);
  });
});
