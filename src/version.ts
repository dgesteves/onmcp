import pkg from '../package.json' with { type: 'json' };

/** The version of onmcp, as published. */
export const VERSION: string = pkg.version;
