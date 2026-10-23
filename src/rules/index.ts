import type { Rule } from '../types.js';
import { hiddenCharacters } from './hidden-characters.js';
import { paramDescription } from './param-description.js';
import { requiredProperties } from './required-properties.js';
import { schemaObject } from './schema-object.js';
import { toolDescription } from './tool-description.js';
import { toolName } from './tool-name.js';
import { uniqueNames } from './unique-names.js';

/** Every rule onmcp has, in the order it runs them. */
export const rules: readonly Rule[] = [
  toolDescription,
  toolName,
  uniqueNames,
  schemaObject,
  requiredProperties,
  paramDescription,
  hiddenCharacters,
];
