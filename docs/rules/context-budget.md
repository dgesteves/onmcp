# context-budget

The server's instructions and tools fit in `maxTokens` of the model's context, 10,000 by default. **Warning** by default.

## Why

Before the model reads the user's message, a host gives it the instructions of each server it connects, and the name, description and input schema of every tool. It does that with every request, whether the model calls a tool or not. Each token a server takes there is context the model doesn't have for the user's task, and a cost on every turn of every conversation.

A server can be expensive with every description short, which [`description-budget`](description-budget.md) checks one by one. It can be its schemas, with a long description on each argument and enums of hundreds of values. Or it can be its number of tools: 80 tools that wrap each endpoint of an API, at 300 tokens each, take 24,000 tokens.

The rule adds up an estimate of the server's instructions and of each tool as JSON (name, description and input schema), and reports the server when the total is over the budget, with the largest three, so you know where to start. Prompts and resources aren't counted: a host lists them for the user to pick from. Output schemas aren't either, since most hosts don't send them to the model. Tokenizers differ from model to model, so the rule counts about four characters a token, and a token for each Chinese, Japanese or Korean character, as `description-budget` does.

10,000 tokens is 5% of a 200,000-token context window, for one server. A user connects several.

## Example

MCP's reference server, `server-everything`, is well under the default budget. With `maxTokens` set to 1,000, it's reported:

```console
$ onmcp check -- npx -y @modelcontextprotocol/server-everything

  server
  ⚠ context-budget  The server’s 16 tools and instructions are about 2,568 tokens, over the budget of 1,000: a host sends those tokens to the model with every request. The largest: the instructions (785), gzip-file-as-resource (274), get-header-params (178).
                    → Trim the largest first. With many tools, merge the ones that do nearly the same thing, or split the server so a host loads only what it needs.
```

## Options

| Option      | Default | What it does                                                               |
| ----------- | ------- | -------------------------------------------------------------------------- |
| `maxTokens` | `10000` | The most tokens the instructions and tools can be, as the rule counts them |

```json
{
  "rules": {
    "context-budget": ["warning", { "maxTokens": 5000 }]
  }
}
```

## Fix

Trim the largest first: they're named in the message. Then look at the number of tools. Tools that do nearly the same thing, such as `get_issue`, `get_issue_comments` and `get_issue_events`, can often be one tool with an argument. A server that does many unrelated things can be split, so a host connects only the part a user needs.
