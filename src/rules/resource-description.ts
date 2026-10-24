import type { Rule } from '../types.js';

/**
 * A host lists a server's resources for the user to attach, or gives the model a tool to list them
 * and read the one it picks. Either way, a resource is chosen by its name and description before
 * anyone reads it: with no description, the model may read a large one only to learn what it is.
 */
export const resourceDescription: Rule = {
  name: 'resource-description',
  description: 'Every resource has a description.',
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
  },
};
