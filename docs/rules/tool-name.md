# tool-name

Tool names use only the characters MCP allows, and at most 128 of them. **Error** by default.

## Why

The MCP spec (2025-11-25) says a tool's name is 1 to 128 characters: ASCII letters, digits, `_`, `-` and `.`, with no spaces, commas or other characters. Hosts check names, and the model APIs they pass them to are stricter still: a name with a space or a slash is the usual reason a server's tools don't show up, or the whole server fails to load.

## Examples

Reported, with the fix onmcp suggests:

| Name              | Fix                        |
| ----------------- | -------------------------- |
| `search docs`     | Rename it `search_docs`    |
| `repos/list, all` | Rename it `repos_list_all` |
| `créer_page`      | Rename it `creer_page`     |

Passes: `search_docs`, `get-page`, `docs.search`.

## Fix

Rename the tool with only letters, digits, `_`, `-` and `.`. onmcp suggests the name with each run of other characters made into one `_`, and accents dropped.
