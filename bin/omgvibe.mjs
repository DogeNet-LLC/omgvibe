#!/usr/bin/env node
// Entry shim: checks the Node version with syntax every Node understands, then
// loads the bundle. The bundle uses APIs that older Node versions fail to parse
// or import, so the check has to happen before it is loaded.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);

if (major < 20 || (major === 20 && minor < 12)) {
  console.error(
    `omgvibe needs Node.js 20.12 or newer (this is ${process.versions.node}).\n` +
      'Install a current release from https://nodejs.org and run the command again.',
  );
  process.exit(1);
}

await import('../dist/cli.mjs');
