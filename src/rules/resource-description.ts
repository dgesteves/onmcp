import type { Rule } from '../types.js';

/**
 * A host lists a server's resources for the user to attach, or gives the model a tool to list them
 * and read the one it picks. Either way, a resource is chosen by its name and description before
 * anyone reads it: with no description, the model may read a large one only to learn what it is.
 * A template's description is also the only place to say what goes in its variables.
 */
export const resourceDescription: Rule = {
  name: 'resource-description',
  description: 'Every resource and resource template has a description.',
  severity: 'warning',
  check({ snapshot, report }) {
    for (const resource of snapshot.resources) {
      if (resource.description?.trim()) continue;
      report({
        target: { kind: 'resource', uri: resource.uri, path: 'description' },
        message:
          resource.description === undefined
            ? 'The resource has no description.'
            : 'The description is empty.',
        fix: 'Say what the resource holds and when it’s worth reading, in a sentence or two.',
      });
    }
    for (const template of snapshot.resourceTemplates) {
      if (template.description?.trim()) continue;
      report({
        target: {
          kind: 'resource-template',
          uriTemplate: template.uriTemplate,
          path: 'description',
        },
        message:
          template.description === undefined
            ? 'The template has no description: whoever reads it fills in its variables from their names alone.'
            : 'The description is empty: whoever reads it fills in its variables from their names alone.',
        fix: 'Say what it reads and what goes in each variable, with an example URI.',
      });
    }
  },
};
