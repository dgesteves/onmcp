# param-name

Argument names use only ASCII letters, digits, `_`, `-` and `.`, and at most 64 of them. **Error** by default.

## Why

JSON Schema lets a property have any name, and so does MCP. The Claude API doesn't: each key in a tool's `input_schema.properties` must match `^[a-zA-Z0-9_.-]{1,64}$`, and a tool with one that doesn't fails the whole request with a 400:

```
tools.42.custom.input_schema.properties: Property keys should match pattern '^[a-zA-Z0-9_.-]{1,64}'
```

A host sends every tool with every request, so one such name fails every turn until the tool is gone, even a "hello". Recent versions of Claude Code check the names themselves, and drop the tool before the model sees it, without saying so: the server loads, and one of its tools never shows up.

These names nearly always come from a server generated from an OpenAPI spec, which names arguments after query parameters: `uids[]` for an array, `filter[status]` for a nested filter, Google's `$.xgafv`.

onmcp checks the top level of each tool's `inputSchema`, the names the API's error points at.

## Examples

Reported, with the fix onmcp suggests:

| Name             | Fix                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `uids[]`         | Rename it `uids`, and map it back to `uids[]` where the server uses it |
| `filter[status]` | Rename it `filter_status`, and map it back to `filter[status]`         |
| `$.xgafv`        | Rename it `xgafv`, and map it back to `$.xgafv`                        |
| `page size`      | Rename it `page_size`, and map it back to `page size`                  |

Passes: `query`, `page-size`, `filter.status`, `_id`.

## Fix

Rename the argument with only letters, digits, `_`, `-` and `.`, and at most 64 of them. When the name is one an API needs, such as a query parameter, keep it where the server calls that API: take the argument as `uids`, and send it on as `uids[]`. Change the name in `required` too.
