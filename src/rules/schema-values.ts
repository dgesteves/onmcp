import type { JsonSchema, Rule } from '../types.js';
import { isSchema, walk } from '../util/schema.js';

// The types JSON Schema has, and the values each one takes.
const FITS: Record<string, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
  array: (value) => Array.isArray(value),
  object: isSchema,
};

/**
 * A model copies the values a schema gives it: it picks from enum, sends const, and follows
 * default and examples. A value of another type than the schema's fails validation, and the type
 * fails the enum: `"10"` in the enum of an integer passes neither as `"10"` nor as `10`.
 */
export const schemaValues: Rule = {
  name: 'schema-values',
  description: 'A schema’s enum, const, default and examples fit its type, at every depth.',
  severity: 'error',
  check({ snapshot, report }) {
    for (const tool of snapshot.tools) {
      for (const { schema, path } of walk(tool.inputSchema, 'inputSchema')) {
        const who = subject(path);
        const target = (keyword: string) =>
          ({ kind: 'tool', name: tool.name, path: `${path}.${keyword}` }) as const;
        if (Array.isArray(schema.enum) && schema.enum.length === 0) {
          report({
            target: target('enum'),
            message: `${who} has an empty enum: no value passes it, so the model can’t send one.`,
            fix: 'List the values it takes, or take out the enum.',
          });
        }

        const allowed = types(schema);
        if (!allowed) continue;
        const type = JSON.stringify(schema.type);
        const misfits = (values: readonly unknown[]) =>
          values.filter((value) => !allowed.some((name) => FITS[name]?.(value)));

        const badEnum = Array.isArray(schema.enum) ? misfits(schema.enum) : [];
        if (badEnum.length > 0) {
          report({
            target: target('enum'),
            message: `${who} lists ${list(badEnum)} in its enum, but its type is ${type}: no value passes both, so the model can’t send ${them(badEnum)}.`,
            fix: fix(badEnum, allowed),
          });
        }
        const badConst = Object.hasOwn(schema, 'const') ? misfits([schema.const]) : [];
        if (badConst.length > 0) {
          report({
            target: target('const'),
            message: `${who} has const ${list(badConst)}, but its type is ${type}: no value passes both, so the model can’t send one.`,
            fix: fix(badConst, allowed),
          });
        }
        const badDefault = Object.hasOwn(schema, 'default') ? misfits([schema.default]) : [];
        if (badDefault.length > 0) {
          report({
            target: target('default'),
            message: `${who} defaults to ${list(badDefault)}, but its type is ${type}: a model that sends the default fails validation.`,
            fix: fix(badDefault, allowed),
          });
        }
        const badExamples = Array.isArray(schema.examples) ? misfits(schema.examples) : [];
        if (badExamples.length > 0) {
          report({
            target: target('examples'),
            message: `${who} has the example${badExamples.length === 1 ? '' : 's'} ${list(badExamples)}, but its type is ${type}: a model that follows ${them(badExamples)} fails validation.`,
            fix: fix(badExamples, allowed),
          });
        }
      }
    }
  },
};

// The schema's type, as a list. A type JSON Schema doesn't have, such as "int", isn't this rule's
// to judge.
function types(schema: JsonSchema): string[] | undefined {
  const { type } = schema;
  const names: unknown[] = typeof type === 'string' ? [type] : Array.isArray(type) ? type : [];
  if (names.length === 0) return undefined;
  return names.every((name) => typeof name === 'string' && Object.hasOwn(FITS, name))
    ? (names as string[])
    : undefined;
}

// How a message names a schema: a property by its name, anything else by its path.
function subject(path: string): string {
  const match = /\.properties\.([^.]+)$/.exec(path);
  return match ? `"${match[1] ?? ''}"` : path;
}

// The values written as the type, when each one converts as written: "10" as 10, 1 as "1".
function fix(values: readonly unknown[], allowed: readonly string[]): string {
  const converted = values.map((value) => convert(value, allowed));
  if (converted.every((value) => value !== undefined)) {
    return `Write ${list(values)} as ${list(converted)}.`;
  }
  return `Change ${them(values)} to fit the type, or the type to fit ${them(values)}.`;
}

function convert(value: unknown, allowed: readonly string[]): unknown {
  for (const name of allowed) {
    if (typeof value === 'string') {
      const text = value.trim();
      if (name === 'integer' && /^-?\d+$/.test(text)) return Number(text);
      if (name === 'number' && text !== '' && Number.isFinite(Number(text))) return Number(text);
      if (name === 'boolean' && (text === 'true' || text === 'false')) return text === 'true';
    }
    if (name === 'string' && (typeof value === 'number' || typeof value === 'boolean')) {
      return String(value);
    }
  }
  return undefined;
}

// Values as JSON, such as "10", "20" and 3 more: up to four by name, since "and 1 more" says less.
function list(values: readonly unknown[]): string {
  if (values.length > 4) {
    return `${values.slice(0, 3).map(show).join(', ')} and ${values.length - 3} more`;
  }
  const shown = values.map(show);
  return shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1) ?? ''}`
    : show(values[0]);
}

function show(value: unknown): string {
  const json = JSON.stringify(value);
  return json.length > 40 ? `${json.slice(0, 39)}…` : json;
}

function them(values: readonly unknown[]): string {
  return values.length === 1 ? 'it' : 'them';
}
