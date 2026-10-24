# similar-names

No two tool names differ only in case, separators, a plural or a version, such as `get_user` and `get_users`. **Warning** by default.

## Why

A model narrows down which tool to call by name before it reads the descriptions, and it writes the name back when it calls one. Two names that say the same thing don't help it choose, and one letter is easy to get wrong when it writes the call:

- `get_user` and `getUser`, or `search` and `Search`: the same words, written two ways. MCP's names are case-sensitive, so [`unique-names`](unique-names.md) lets them be.
- `get_user` and `get_users`: one returns a user and the other a list, and only an `s` says which.
- `search` and `search_v2`, or `fetch_page` and `fetch_page_legacy`: the model can't tell from the names which one to use, and often calls the old one.

The rule splits each tool's name into words, however it's written (`get_user`, `getUser`, `get-user`, `GET_USER`), and compares them in three steps, each looser than the one before: as they are, with plurals made singular, and without a version at the end (`v2`, `2`, `new`, `old`, `legacy`, `beta`, `alpha`, `next`, `deprecated` or `experimental`). It reports the second tool of a pair, once, against the first one it's like.

Names that differ by a word pass, even by a short one: `get_file` and `set_file` say what sets them apart.

## Examples

Reported (`get_users`):

```json
[
  { "name": "get_user", "description": "Gets a user by ID.", "inputSchema": { "type": "object" } },
  {
    "name": "get_users",
    "description": "Lists the users in a team.",
    "inputSchema": { "type": "object" }
  }
]
```

Passes: `get_user` and `list_team_members`.

## Fix

Name each tool for what sets it apart: `get_user` and `list_users`, or `search_docs` and `search_issues`. If one replaces the other, remove the old one.
