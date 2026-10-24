# resource-description

Every resource and resource template has a description. **Warning** by default.

## Why

MCP leaves it to the host how resources are used. It can list them for the user to attach, or give the model a tool that lists them and reads the one it picks. Either way, a resource is chosen by its name and description before anyone reads it.

With no description, only the name and the URI say what a resource holds: `docs://index` could be a table of contents, or every page of the docs at once. The user attaches the wrong one, or the model reads a large resource only to find out what it is, and fills the context the resource was meant to save.

A resource template, such as `git://diff/{base}...{head}`, needs its description more. Before anyone can read it, they fill in its variables, and a template has no schema to say what each one takes: a branch, a tag or a commit, a path from the root or from the current folder. The description is the only place to say so.

## Examples

Reported:

```json
{ "uri": "docs://index", "name": "index", "mimeType": "text/markdown" }
```

```json
{ "uriTemplate": "git://diff/{base}...{head}", "name": "diff" }
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

```json
{
  "uriTemplate": "git://diff/{base}...{head}",
  "name": "diff",
  "description": "The diff between two commits, branches or tags, such as git://diff/main...feature/login."
}
```

## Fix

Say what the resource holds and when it's worth reading, in a sentence or two. For a template, say what it reads and what goes in each variable, with an example URI. A description that is only whitespace is reported too. With the TypeScript SDK, `registerResource` takes it in its config, for a URI and a `ResourceTemplate` alike: `{ description: '…', mimeType: 'text/markdown' }`.
