# schema-object

A tool's `inputSchema` and `outputSchema` have `type: "object"`, with readable `properties` and `required`. **Error** by default.

## Why

MCP requires a tool's `inputSchema` to be an object schema, since a tool's arguments are named, and its `outputSchema`, when it has one, too, since structured content is a JSON object. Hosts that check the schema drop a tool that breaks this, and those that don't leave the model to guess what to send. A missing `"type"` is the usual case: a schema written by hand, or generated from a type that isn't an object.

The rule also checks the two keywords hosts read first: `properties` is an object that maps each name to its schema, and `required` is an array of names. That `required` only names properties that exist is [`required-properties`](required-properties.md).

## Examples

Reported:

```json
{ "inputSchema": { "properties": { "query": { "type": "string" } } } }
{ "inputSchema": { "type": "string" } }
{ "inputSchema": { "type": "object", "properties": [{ "name": "query" }] } }
{ "outputSchema": { "type": "array", "items": { "type": "string" } } }
```

Passes:

```json
{
  "inputSchema": {
    "type": "object",
    "properties": { "query": { "type": "string" } },
    "required": ["query"]
  },
  "outputSchema": {
    "type": "object",
    "properties": { "results": { "type": "array", "items": { "type": "string" } } }
  }
}
```

## Fix

Add `"type": "object"`. When the tool takes or returns a single value, put it in a named property, such as `query` or `results`: the name tells the model what the value is.
