# param-description

Every argument in a tool's `inputSchema` has a description, at every depth. **Warning** by default.

## Why

The model fills in each argument from three things: its name, its schema and its description. With no description it has only the name and the type: `q` could be a search query, a quota or a queue, and `since` a date, a timestamp or a version. The model guesses, the call fails or returns the wrong thing, and it tries again, spending tokens and the user's time.

The rule checks every property of every object in `inputSchema`, nested objects and array items too. A property whose local `$ref` (such as `#/$defs/tag`) points to a schema with a description passes. Output schemas aren't checked: the model reads results, it doesn't write them.

## Examples

Reported:

```json
{
  "type": "object",
  "properties": { "q": { "type": "string" }, "since": { "type": "string" } }
}
```

Passes:

```json
{
  "type": "object",
  "properties": {
    "q": { "type": "string", "description": "What to look for, in plain words." },
    "since": {
      "type": "string",
      "description": "Only results changed after this date, as YYYY-MM-DD, such as 2026-10-01."
    }
  }
}
```

## Fix

Say what the argument is, in what format, with an example value. With zod, `.describe()` writes the description: `z.string().describe('What to look for, in plain words.')`.
