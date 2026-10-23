# onmcp

**Keeps your MCP server agent-friendly:** checks the tools, prompts and resources your server lists the way a model reads them, and catches names that don't parse, descriptions that eat the context window, schemas a model can't fill in, and text that reads like an injected instruction, with the fix. Run it on a running server or on a saved `tools/list`, from the CLI, in CI, or as an MCP server your agent calls while it builds yours.

> Work in progress: the first release is on its way. See [what's planned](#planned).

```console
$ npx onmcp check -- node ./server.js

  search_docs
  ✖ description-budget   412 tokens, over the 200-token budget
  ⚠ param-description    "q" has no description
  ✖ injection-phrases    the description says "ignore previous instructions"

  3 problems (2 errors, 1 warning) in 14 tools
```

## Planned

- A lint engine with one documented rule per problem, each with a fix
- Servers read from a saved snapshot, over stdio, or over Streamable HTTP
- Pretty, JSON, SARIF and GitHub annotation output
- A GitHub Action that checks the server on every pull request
- An MCP server, so the agent writing your server can check it as it goes

## More from @dgesteves

- [onsystem](https://github.com/dgesteves/onsystem): keeps coding agents on your design system
- [ondocs](https://github.com/dgesteves/ondocs): open-source Ask AI for your docs, with an MCP server for agents
- [signoff-ui](https://github.com/dgesteves/signoff-ui): React components to review what your agent changed and approve what it may do

## License

[MIT](LICENSE)
