# schema-values

A schema's `enum`, `const`, `default` and `examples` fit its type, at every depth. **Error** by default.

## Why

A model copies the values a schema gives it. It picks one from `enum`, sends `const`, and follows `default` and `examples`. JSON Schema checks those keywords and `type` separately, so a value of the wrong type can't pass both:

- `"10"` in the enum of an `integer` fails the type when the model sends `"10"`, and the enum when it sends `10`. With only string values in the enum, no call that sets the argument passes, and if it's required, none passes at all.
- A `const` of the wrong type leaves no value that passes.
- A `default` or an example of the wrong type shows the model a value that fails. It sends it, the call fails, and it tries again.
- An empty `enum` passes nothing, whatever the type.

It's nearly always a value written by hand in the wrong form: a number in quotes, `"false"` for `false`, or a float where the type is `integer`.

The rule checks every schema in `inputSchema`: properties, nested objects, array items, `anyOf` branches and `$defs`. A list of types, such as `["string", "null"]`, takes a value of either. A schema with no `type`, or one JSON Schema doesn't have, is left alone. Output schemas aren't checked: the model reads results, it doesn't write them.

## Examples

Reported, with the fix onmcp suggests:

```json
{
  "type": "object",
  "properties": {
    "limit": { "type": "integer", "enum": ["10", "20", "50"] },
    "exact": { "type": "boolean", "default": "false" }
  }
}
```

```
✖ schema-values  "limit" lists "10", "20" and "50" in its enum, but its type is "integer": no value passes both, so the model can’t send them.
                 → Write "10", "20" and "50" as 10, 20 and 50.
✖ schema-values  "exact" defaults to "false", but its type is "boolean": a model that sends the default fails validation.
                 → Write "false" as false.
```

Passes:

```json
{
  "type": "object",
  "properties": {
    "limit": { "type": "integer", "enum": [10, 20, 50] },
    "exact": { "type": "boolean", "default": false }
  }
}
```

## Fix

Write each value as the type: onmcp says how when the value converts as written, such as `"10"` to `10` or `1` to `"1"`. Otherwise, change the value, or change the type if the value was right. For an empty `enum`, list the values the argument takes, or take the enum out.
