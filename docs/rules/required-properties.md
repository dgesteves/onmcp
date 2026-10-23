# required-properties

`required` names only properties the schema has, at every depth. **Error** by default.

## Why

When `required` names a property that `properties` doesn't have, the model must send an argument it has no schema for: no type, no description, only a name. With `additionalProperties: false`, no call can pass validation at all. In an `outputSchema`, the tool's own results fail it. It's nearly always a typo, or a property renamed in `properties` and not in `required`.

The rule checks every object schema in `inputSchema` and `outputSchema`: nested objects, array items, `anyOf` branches and `$defs` too. A schema with `required` but no `properties` is left alone, since another branch can define them (as in `allOf`).

## Examples

Reported, with the fix onmcp suggests:

```json
{
  "type": "object",
  "properties": { "query": { "type": "string" }, "limit": { "type": "integer" } },
  "required": ["qeury"]
}
```

```
✖ required-properties  "qeury" is required but isn’t in properties: the model must send an argument it has no schema for.
                       → Did you mean "query"? Rename it in required.
```

Passes: the same schema with `"required": ["query"]`.

## Fix

Rename the name in `required` to the property it meant. onmcp suggests one when a property is a typo or a swap of letters away. Otherwise, add the property to `properties` with its type and description, or take it out of `required`.
