# resource-description

Every resource has a description. **Warning** by default.

## Why

MCP leaves it to the host how resources are used. It can list them for the user to attach, or give the model a tool that lists them and reads the one it picks. Either way, a resource is chosen by its name and description before anyone reads it.

With no description, only the name and the URI say what a resource holds: `docs://index` could be a table of contents, or every page of the docs at once. The user attaches the wrong one, or the model reads a large resource only to find out what it is, and fills the context the resource was meant to save.

## Examples

Reported:

```json
{ "uri": "docs://index", "name": "index", "mimeType": "text/markdown" }
```

Passes:

```json
{
  "uri": "docs://index",
  "name": "index",
  "description": "Every page of the docs by section, as a Markdown list of titles and paths. Read it to find a page before you fetch one.",
  "mimeType": "text/markdown"
}
```

## Fix

Say what the resource holds and when it's worth reading, in a sentence or two. A description that is only whitespace is reported too. With the TypeScript SDK, `registerResource` takes it in its config: `{ description: '…', mimeType: 'text/markdown' }`.
