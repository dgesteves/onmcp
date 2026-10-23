// Past this depth the walk stops, so JSON nested without end can't overflow the stack.
const MAX_DEPTH = 64;

/**
 * Each string in a JSON value, with its path, depth first: values, and object keys too, since a
 * property's name is text the model reads. A key's path is its object's path with the key added.
 */
export function* strings(value: unknown, path: string, depth = 0): Generator<[string, string]> {
  if (typeof value === 'string') {
    yield [path, value];
    return;
  }
  if (depth >= MAX_DEPTH || typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* strings(item, join(path, String(index)), depth + 1);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    yield [join(path, key), key];
    yield* strings(item, join(path, key), depth + 1);
  }
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}
