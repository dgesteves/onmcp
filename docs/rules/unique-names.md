# unique-names

No two tools or prompts share a name, and no two resources share a URI. **Error** by default.

## Why

A host looks tools up by name. When two share one, it keeps one of them (which one depends on the host), and the model can't reach the other at all. Prompts are looked up by name and resources by URI, so the same goes for them. It usually happens when a server registers tools from two modules that both define `search`.

Names are case-sensitive in MCP, so `search` and `Search` don't clash here. They're still easy for a model to mix up: that's [`similar-names`](similar-names.md).

## Examples

Reported (the second `search`):

```json
[
  { "name": "search", "description": "Searches the docs.", "inputSchema": { "type": "object" } },
  { "name": "search", "description": "Searches the issues.", "inputSchema": { "type": "object" } }
]
```

Passes: `search_docs` and `search_issues`.

## Fix

Rename one of the tools or prompts, or give each resource its own URI. A tool and a prompt may share a name: hosts keep them apart.
