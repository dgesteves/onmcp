import type { Rule } from '../types.js';
import { schemaObject } from './schema-object.js';
import { toolDescription } from './tool-description.js';
import { toolName } from './tool-name.js';
import { uniqueNames } from './unique-names.js';

/** Every rule onmcp has, in the order it runs them. */
export const rules: readonly Rule[] = [toolDescription, toolName, uniqueNames, schemaObject];
