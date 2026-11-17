import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isOmgvibeCommand, shortcutState } from '../src/core/shortcut';

// Links and execute bits: the POSIX half. On Windows npm writes launcher scripts instead, covered by the last test.
const posix = process.platform !== 'win32';

let root: string;
const dir = (name: string): string => path.join(root, name);
const script = async (file: string, body: string): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, { mode: 0o755 });
};
const env = (...dirs: string[]): NodeJS.ProcessEnv => ({ PATH: dirs.join(path.delimiter) });

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'omgvibe-shortcut-')));
  // A global install: bin/ov -> lib/node_modules/omgvibe/bin/ov.mjs
  await script(dir('global/lib/node_modules/omgvibe/bin/ov.mjs'), '#!/bin/sh\necho 1.0.0\n');
  await fs.mkdir(dir('global/bin'), { recursive: true });
  if (posix) await fs.symlink('../lib/node_modules/omgvibe/bin/ov.mjs', dir('global/bin/ov'));
  // Another program that happens to be called ov.
  await script(dir('other/ov'), '#!/bin/sh\necho "ov version 0.37.0"\n');
  // A version manager's launcher: says nothing about what it starts.
  await script(dir('shims/ov'), `#!/bin/sh\nexec "${dir('global/lib/node_modules/omgvibe/bin/ov.mjs')}" "$@"\n`.replace('omgvibe/bin/ov.mjs', 'omgvibe/bin/./ov.mjs'));
  // What npx puts on PATH while it runs a package.
  await script(dir('cache/_npx/abc123/node_modules/.bin/ov'), '#!/bin/sh\necho 1.0.0\n');
  await fs.mkdir(dir('empty'), { recursive: true });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe.runIf(posix)('what `ov` runs in the user\'s shell', () => {
  it('is missing when nothing of that name is on PATH', async () => {
    expect(await shortcutState(env(dir('empty')))).toEqual({ state: 'missing' });
    expect(await shortcutState({})).toEqual({ state: 'missing' });
  });

  it('is ready when the first match links into the installed package', async () => {
    expect(await shortcutState(env(dir('empty'), dir('global/bin'), dir('other')))).toEqual({ state: 'ready', path: dir('global/bin/ov') });
  });

  it('is shadowed when another program of the same name comes first', async () => {
    expect(await shortcutState(env(dir('other'), dir('global/bin')))).toEqual({ state: 'shadowed', path: dir('other/ov') });
  });

  it('recognises omgvibe behind a version manager\'s launcher by asking it', async () => {
    expect(isOmgvibeCommand(dir('shims/ov'))).toBe(false);
    expect(await shortcutState(env(dir('shims')))).toEqual({ state: 'ready', path: dir('shims/ov') });
  });

  it('does not count the copy npx puts on PATH for the length of one run', async () => {
    expect(await shortcutState(env(dir('cache/_npx/abc123/node_modules/.bin')))).toEqual({ state: 'missing' });
  });
});

describe('recognising omgvibe\'s own command file', () => {
  it('accepts the launcher script npm writes on Windows and rejects anything else', async () => {
    const launcher = dir('win/ov.cmd');
    await script(launcher, '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\omgvibe\\bin\\ov.mjs" %*\r\n');
    expect(isOmgvibeCommand(launcher)).toBe(true);
    expect(isOmgvibeCommand(dir('other/ov'))).toBe(false);
    expect(isOmgvibeCommand(dir('nowhere/ov'))).toBe(false);
  });
});
