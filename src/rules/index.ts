import type { Rule } from '../types.js';
import { contextBudget } from './context-budget.js';
import { descriptionBudget } from './description-budget.js';
import { hiddenCharacters } from './hidden-characters.js';
import { injectionPhrases } from './injection-phrases.js';
import { paramDescription } from './param-description.js';
import { requiredProperties } from './required-properties.js';
import { schemaObject } from './schema-object.js';
import { sensitivePaths } from './sensitive-paths.js';
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
  descriptionBudget,
  contextBudget,
  hiddenCharacters,
  injectionPhrases,
  sensitivePaths,
];
