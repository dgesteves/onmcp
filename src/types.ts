/** A JSON Schema, as a server sends it: rules read it, and never trust its shape. */
export type JsonSchema = Record<string, unknown>;

/** The hints a tool gives a client about what calling it does (MCP's ToolAnnotations). */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

/** What a server lists, as onmcp checks it: read from a saved file, or from the server itself. */
export interface Snapshot {
  server?: { name: string; version: string; title?: string };
  /** The instructions the server returns from initialize, which hosts add to the system prompt. */
  instructions?: string;
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
}

export type Severity = 'error' | 'warning';

/**
 * Where a problem is: the server itself, or one of its tools, prompts or resources. `path` points
 * into it, such as `inputSchema.properties.query` or `arguments.0`.
 */
export type Target =
  | { kind: 'server'; path?: string }
  | { kind: 'tool' | 'prompt'; name: string; path?: string }
  | { kind: 'resource'; uri: string; path?: string };

export interface Problem {
  rule: string;
  severity: Severity;
  target: Target;
  message: string;
  /** What to change, in one sentence. */
  fix?: string;
}

/** A problem as a rule reports it: lint() adds the rule's name and severity. */
export type Report = Omit<Problem, 'rule' | 'severity'>;

export interface RuleContext<Options extends object> {
  snapshot: Snapshot;
  /** The rule's defaults, with the options the config sets for it on top. */
  options: Options;
  report: (problem: Report) => void;
}

export interface Rule<Options extends object = object> {
  /** kebab-case, as configs and output name it: `description-budget`. */
  name: string;
  /** One line: what the rule catches. */
  description: string;
  /** The severity it reports at unless the config says otherwise. */
  severity: Severity;
  /**
   * Every option the rule takes, with its default. A config can set only these, and each to a
   * value of its default's type.
   */
  defaults?: Options;
  check(context: RuleContext<Options>): void;
}

/**
 * How a config sets a rule: off, at a severity, or at a severity with options, as in
 * `"description-budget": ["error", { "maxTokens": 300 }]`.
 */
export type RuleSetting = 'off' | Severity | [Severity, Record<string, unknown>];

export interface Config {
  rules?: Record<string, RuleSetting>;
}
