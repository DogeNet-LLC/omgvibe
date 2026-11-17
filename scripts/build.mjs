// Bundles the CLI into one file so `npx omgvibe` downloads a single small
// package with no dependency tree to resolve.
import { chmod, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Prefer a dependency's ES module build: jsonc-parser's `main` is a UMD
  // wrapper whose internal require() calls cannot be bundled.
  mainFields: ['module', 'main'],
  minify: false,
  legalComments: 'none',
  define: { __OMGVIBE_VERSION__: JSON.stringify(pkg.version) },
  // cross-spawn is CommonJS and calls require() for node builtins.
  banner: {
    js: "import { createRequire as __omgvibeCreateRequire } from 'node:module';\nconst require = __omgvibeCreateRequire(import.meta.url);",
  },
});

await chmod(new URL('../bin/omgvibe.mjs', import.meta.url), 0o755);
console.log(`built dist/cli.mjs (omgvibe ${pkg.version})`);
