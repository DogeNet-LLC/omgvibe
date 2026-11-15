#!/usr/bin/env node
// `ov` is the short name for `omgvibe`. It says which name was used, so that
// every command omgvibe tells the user to type is the one they already type.
globalThis.__omgvibeCommand = 'ov';

await import('./omgvibe.mjs');
