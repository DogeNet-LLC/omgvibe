import { accessSync, constants as fsConstants, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { isNpxPath, SHORT_COMMAND } from './invocation';
import { capture } from './process';
import { PACKAGE_NAME } from './version';

/**
 * What typing `ov` in the user's shell would run.
 *
 * - `ready`: omgvibe.
 * - `missing`: nothing; omgvibe is not installed globally (or predates `ov`).
 * - `shadowed`: another program of the same name that comes first on `PATH`.
 */
export type ShortcutState =
  | { state: 'ready'; path: string }
  | { state: 'missing' }
  | { state: 'shadowed'; path: string };

const isWindows = process.platform === 'win32';

/** `PATH` entries a shell would search, without the ones npm adds only while it runs a package. */
function searchDirs(env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? env.Path ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .filter((dir) => !isNpxPath(dir) && !/[\\/]node_modules[\\/]\.bin[\\/]?$/.test(dir));
}

function firstOnPath(name: string, env: NodeJS.ProcessEnv): string | null {
  const extensions = isWindows
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((extension) => extension.toLowerCase())
    : [''];
  for (const dir of searchDirs(env)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      try {
        if (!statSync(candidate).isFile()) continue;
        if (!isWindows) accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return null;
}

/**
 * True when the file can be seen to be omgvibe's `ov` without running it: a
 * link into the installed package, or the small launcher script npm writes on
 * Windows, which names the package's file.
 */
export function isOmgvibeCommand(file: string): boolean {
  try {
    const real = realpathSync(file);
    const target = new RegExp(`[\\\\/]${PACKAGE_NAME}[\\\\/]bin[\\\\/]${SHORT_COMMAND}\\.mjs`);
    if (target.test(real)) return true;
    return statSync(real).size <= 8192 && target.test(readFileSync(real, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Version managers such as Volta and asdf put their own launcher in front of
 * every command, and it says nothing about what it starts. The only way to
 * tell is to ask: omgvibe answers `--version` with a bare version number.
 */
async function answersLikeOmgvibe(file: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const result = await capture(file, ['--version'], { timeoutMs: 4000, env });
  return result.code === 0 && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(result.stdout.trim());
}

export async function shortcutState(env: NodeJS.ProcessEnv = process.env): Promise<ShortcutState> {
  const found = firstOnPath(SHORT_COMMAND, env);
  if (!found) return { state: 'missing' };
  const ours = isOmgvibeCommand(found) || (await answersLikeOmgvibe(found, env));
  return ours ? { state: 'ready', path: found } : { state: 'shadowed', path: found };
}
