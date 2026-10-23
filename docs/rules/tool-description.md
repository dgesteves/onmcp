# tool-description

Every tool has a description. **Error** by default.

## Why

A model chooses which tool to call from its name and its description. With no description it guesses from the name alone: it calls `sync` when it shouldn't, or misses `get_page` when it needed it.

## Examples

Reported:

```json
{ "name": "sync", "inputSchema": { "type": "object" } }
```

Passes:

```json
{
  "name": "sync",
  "description": "Pulls the latest docs from the repository and rebuilds the search index. Call it when search results look out of date.",
  "inputSchema": { "type": "object" }
}
```

## Fix

Say what the tool does and when to call it, in a sentence or two. A description that is only whitespace is reported too.
