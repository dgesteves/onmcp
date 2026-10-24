# description-budget

A tool's description fits in `maxTokens`, 500 by default. **Warning** by default.

## Why

A host sends the model every tool's name, description and input schema with each request, whether the model calls the tool or not. A description's tokens are spent on every turn of every conversation: a server with 20 tools of 1,500 tokens each takes 30,000 tokens of the model's context before the user has typed a word, and adds them to every bill.

A long description also reads worse. The model reads it to decide whether this is the tool to call, and how; a description that has grown into a manual, with every option, edge case and changelog entry, buries that in text the model only needs once it's calling the tool, if at all.

The rule estimates each tool description's tokens and reports one over the budget. Tokenizers differ from model to model, so it counts about four characters a token, as English and code come out of most of them, and a token for each Chinese, Japanese or Korean character. The message says "about" for that reason. Argument descriptions aren't counted: [`param-description`](param-description.md) asks for those.

500 tokens is about 2,000 characters, or 350 words: room for what the tool does, when to call it and when not to, and an example. A tool that needs more can say so in the config.

## Examples

Reported: a description that has grown into a manual, shortened here.

```json
{
  "name": "query",
  "description": "Runs a query against the warehouse. Supported syntax: SELECT ... (40 more lines of grammar). Changelog: v2 added ... Known issues: ..."
}
```

Passes:

```json
{
  "name": "query",
  "description": "Runs a read-only SQL query against the analytics warehouse and returns up to 500 rows. Call list_tables first to see what you can query. Errors explain what to change."
}
```

## Options

| Option      | Default | What it does                                                  |
| ----------- | ------- | ------------------------------------------------------------- |
| `maxTokens` | `500`   | The most tokens a description can be, as the rule counts them |

```json
{
  "rules": {
    "description-budget": ["warning", { "maxTokens": 300 }]
  }
}
```

## Fix

Keep what the model needs to choose the tool and call it: what it does, when to call it, and what its arguments mean. Move reference material into a resource the model can read when it needs it, or into what the tool returns: an error that says what to change teaches the model at the moment it needs to know.
