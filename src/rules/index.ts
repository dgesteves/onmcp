import type { Rule } from '../types.js';
import { toolDescription } from './tool-description.js';
import { toolName } from './tool-name.js';

/** Every rule onmcp has, in the order it runs them. */
export const rules: readonly Rule[] = [toolDescription, toolName];
