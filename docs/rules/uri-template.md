# uri-template

A resource template's variables are in `{braces}`, and each brace closes. **Error** by default.

## Why

A client reads a resource template by filling in the variables in its braces, as RFC 6570 writes them: `file:///{path}` with `path` set to `README.md` reads `file:///README.md`. When the braces are wrong, or a variable is written another way, there's nothing to fill in, or the wrong thing:

- A `{` with no `}` after it: the MCP SDK refuses the whole template ("Unclosed template expression"), and a client built on it can't read anything from it.
- A `{` that closes only after the next one: in `docs://{owner}/{repo/{path}`, the SDK reads one variable named `repo/{path`, which no one will fill in.
- A `}` that no `{` opens stays in every URI, and a URI can't hold one.
- A placeholder from a router or another template syntax, such as Express's `/:id`, `<id>` or Next.js's `[id]`, is text to a URI template. A client can't fill in `id`, and reads `users://:id/profile` as written.

onmcp doesn't check the rest of RFC 6570. A name such as `{repo-name}` isn't one RFC 6570 allows, but the MCP SDK and most clients read it, so it isn't reported.

## Examples

Reported, with the fix onmcp suggests:

| URI template                  | Fix                                              |
| ----------------------------- | ------------------------------------------------ |
| `file:///{path`               | Close the variable with `}`, as in `{path}`      |
| `docs://{owner}/{repo/{path}` | Close each variable with `}` before the next `{` |
| `users://:id/profile`         | Write it as `{id}`                               |
| `pages://[slug]`              | Write it as `{slug}`                             |

Passes: `file:///{path}`, `git://diff/{base}...{head}`, `search://docs{?q,limit}`, `http://localhost:8080/{path}`.

## Fix

Put each variable in braces, and close each one before the next starts. With the TypeScript SDK, a template is a `new ResourceTemplate('users://{id}/profile', { list: undefined })` passed to `registerResource`, and its read callback gets `{ id }` in its variables.
