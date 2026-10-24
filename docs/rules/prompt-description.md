# prompt-description

Every prompt, and each of its arguments, has a description. **Warning** by default.

## Why

A tool's description is for the model. A prompt's is for a person: MCP prompts are templates the user picks, and a host lists them in its interface, often as slash commands, with each one's description beside its name. When the user picks one, the host asks them for its arguments, by name and description.

With no description, the user has only the name to go on. They pass over `triage` when it was the prompt they needed, or type `42` for `pr` when it wanted a URL. Then the prompt fills its messages with the wrong thing, and the model works from them.

## Examples

Reported:

```json
{
  "name": "review",
  "arguments": [{ "name": "pr", "required": true }, { "name": "focus" }]
}
```

Passes:

```json
{
  "name": "review",
  "description": "Reviews a pull request for bugs and missing tests, and drafts the comments.",
  "arguments": [
    {
      "name": "pr",
      "description": "The pull request's URL, such as https://github.com/acme/api/pull/42.",
      "required": true
    },
    { "name": "focus", "description": "What to look at most, such as \"tests\" or \"security\"." }
  ]
}
```

## Fix

Say what the prompt does and when to use it, in a sentence or two, and say what each argument is, with an example value. A description that is only whitespace is reported too. With the TypeScript SDK, `registerPrompt` takes the prompt's `description`, and `.describe()` on each argument's zod schema writes the argument's.
