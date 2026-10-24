import type { Rule } from '../types.js';
import { contextBudget } from './context-budget.js';
import { descriptionBudget } from './description-budget.js';
import { hiddenCharacters } from './hidden-characters.js';
import { injectionPhrases } from './injection-phrases.js';
import { paramDescription } from './param-description.js';
import { paramName } from './param-name.js';
import { promptDescription } from './prompt-description.js';
import { requiredProperties } from './required-properties.js';
import { resourceDescription } from './resource-description.js';
import { schemaObject } from './schema-object.js';
import { schemaValues } from './schema-values.js';
import { sensitivePaths } from './sensitive-paths.js';
import { similarNames } from './similar-names.js';
import { toolAnnotations } from './tool-annotations.js';
import { toolDescription } from './tool-description.js';
import { toolName } from './tool-name.js';
import { uniqueNames } from './unique-names.js';
import { uriTemplate } from './uri-template.js';

/** Every rule onmcp has, in the order it runs them. */
export const rules: readonly Rule[] = [
  toolDescription,
  toolName,
  paramName,
  uniqueNames,
  similarNames,
  schemaObject,
  requiredProperties,
  schemaValues,
  paramDescription,
  promptDescription,
  resourceDescription,
  uriTemplate,
  descriptionBudget,
  contextBudget,
  toolAnnotations,
  hiddenCharacters,
  injectionPhrases,
  sensitivePaths,
];
