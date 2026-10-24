# tool-annotations

A tool's annotations agree with each other, and none says a tool named for deleting is safe. **Error** by default.

## Why

MCP lets a tool describe what calling it does, in hints a host reads:

| Annotation        | Means, when true                                            | Default |
| ----------------- | ----------------------------------------------------------- | ------- |
| `readOnlyHint`    | It doesn't change anything.                                 | `false` |
| `destructiveHint` | A change it makes can delete or overwrite, not add.         | `true`  |
| `idempotentHint`  | Calling it again with the same arguments does nothing more. | `false` |
| `openWorldHint`   | It reaches outside the server, such as the web.             | `true`  |

Hosts use them to decide what to ask the user about: a tool that says it only reads, or that it doesn't destroy anything, can be run without a confirmation. So a wrong hint can turn a delete into something that happens unasked, whether it's a copy-paste mistake or a poisoned server that wants it to.

The rule reports:

- `readOnlyHint: true` on a tool whose name says it deletes: `delete`, `remove`, `rm`, `drop`, `destroy`, `purge`, `wipe`, `erase`, `truncate`, `overwrite`, `kill`, `terminate`, `revoke` or `uninstall`, as a word of the name in any case (`delete_file`, `deleteFile`, `files.delete`).
- `destructiveHint: false` on one of those, which says it only adds.
- `readOnlyHint` and `destructiveHint` both `true`: a tool that only reads can't destroy anything, so a host can't tell which one to trust.

A word must match whole, so `list_deleted_files` passes. A tool that only works on what it's given, such as `remove_duplicates` over a list, is reported too: a host can't tell it from one that removes records, so rename it (`dedupe`).

## Examples

Reported:

```json
{
  "name": "delete_file",
  "description": "Deletes a file from the workspace.",
  "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } },
  "annotations": { "readOnlyHint": true }
}
```

Passes:

```json
{
  "name": "delete_file",
  "description": "Deletes a file from the workspace.",
  "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } },
  "annotations": { "readOnlyHint": false, "destructiveHint": true }
}
```

## Fix

Set the hints to what the tool does. A tool that deletes needs no annotations at all to be treated as destructive: that's the default. If the tool really only reads, rename it, so the name says so too.

The MCP spec tells hosts to treat annotations as untrusted unless the server is: they're hints for a host to do the right thing with a server you trust, not a guarantee from one you don't.
