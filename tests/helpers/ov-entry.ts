// Starts the CLI the way `bin/ov.mjs` does, from source.
globalThis.__omgvibeCommand = 'ov';

await import('../../src/cli');

export {};
