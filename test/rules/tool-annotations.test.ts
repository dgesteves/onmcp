import { expect, test } from 'vitest';

import { toolAnnotations } from '../../src/rules/tool-annotations.js';
import type { ToolAnnotations } from '../../src/types.js';
import { run } from '../helpers.js';

const check = (name: string, annotations?: ToolAnnotations) =>
  run(toolAnnotations, {
    tools: [{ name, description: 'Does it.', inputSchema: { type: 'object' }, annotations }],
  });

test.each<[string, ToolAnnotations | undefined]>([
  ['delete_file', undefined],
  ['delete_file', { destructiveHint: true }],
  ['delete_file', { readOnlyHint: false, destructiveHint: true, idempotentHint: true }],
  ['get_file', { readOnlyHint: true }],
  ['list_deleted_files', { readOnlyHint: true }],
  ['add', { readOnlyHint: true }],
  ['precio_del_producto', { readOnlyHint: true }],
  ['create_issue', { readOnlyHint: false, destructiveHint: false }],
])('passes %s with %j', (name, annotations) => {
  expect(check(name, annotations)).toEqual([]);
});

test('reports readOnlyHint on a tool named for deleting, and says what a host does with it', () => {
  expect(check('delete_file', { readOnlyHint: true })).toEqual([
    {
      rule: 'tool-annotations',
      severity: 'error',
      target: { kind: 'tool', name: 'delete_file', path: 'annotations.readOnlyHint' },
      message:
        'readOnlyHint says the tool only reads, and "delete" in its name says it doesn’t: a host can run a read-only tool without asking the user.',
      fix: 'Set readOnlyHint to false. If the tool really only reads, rename it.',
    },
  ]);
});

test.each([
  ['deleteFile', 'delete'],
  ['files.remove', 'remove'],
  ['HTTPDelete', 'delete'],
  ['drop-table', 'drop'],
  ['rm', 'rm'],
  ['PurgeCache', 'purge'],
  ['revoke_token', 'revoke'],
])('finds the verb in %s', (name, verb) => {
  expect(check(name, { readOnlyHint: true })[0]?.message).toContain(`"${verb}" in its name`);
});

test('reports destructiveHint false on a tool named for deleting', () => {
  expect(check('remove_user', { destructiveHint: false })).toEqual([
    expect.objectContaining({
      target: { kind: 'tool', name: 'remove_user', path: 'annotations.destructiveHint' },
      message:
        'destructiveHint says the tool only adds, and "remove" in its name says it doesn’t: a host can skip asking the user before a tool that doesn’t destroy anything.',
      fix: 'Take destructiveHint out, since true is the default, or set it to true.',
    }),
  ]);
});

test('reports readOnlyHint and destructiveHint both true', () => {
  expect(check('sync', { readOnlyHint: true, destructiveHint: true })).toEqual([
    expect.objectContaining({
      target: { kind: 'tool', name: 'sync', path: 'annotations.destructiveHint' },
      message:
        'readOnlyHint and destructiveHint are both true: a tool that only reads can’t destroy anything, so a host can’t tell which to trust.',
    }),
  ]);
});

test('reports a tool named for deleting once, for its readOnlyHint', () => {
  const problems = check('delete_file', { readOnlyHint: true, destructiveHint: false });
  expect(problems.map((problem) => problem.target)).toEqual([
    { kind: 'tool', name: 'delete_file', path: 'annotations.readOnlyHint' },
  ]);
});
