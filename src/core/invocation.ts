import { realpathSync } from 'node:fs';

import { PACKAGE_NAME } from './version';

/** The short name the package installs next to `omgvibe`. */
export const SHORT_COMMAND = 'ov';

export interface Invocation {
  /** What the user typed to get here, and should type again: `ov`, `omgvibe` or `npx omgvibe`. */
  program: string;
  /** True when started by `npx`, so nothing is installed and every run goes through npm. */
  npx: boolean;
}

/** True for a path inside npx's cache (`…/_npx/<hash>/node_modules/…`). */
export const isNpxPath = (file: string): boolean => file.split(/[\\/]/).includes('_npx');

/**
 * Works out how omgvibe was started.
 *
 * `shim` is the name the entry file in `bin/` announces. The file name of
 * `argv[1]` cannot be used for this: on Windows npm starts both commands
 * through a launcher that passes the same script path.
 */
export function resolveInvocation(input: { shim?: string | undefined; script?: string | undefined }): Invocation {
  let script = input.script ?? '';
  try {
    script = realpathSync(script);
  } catch {
    // Not a file we can resolve (run from source, or a test): the path as given is all there is.
  }
  if (isNpxPath(script)) return { program: `npx ${PACKAGE_NAME}`, npx: true };
  return { program: input.shim === SHORT_COMMAND ? SHORT_COMMAND : PACKAGE_NAME, npx: false };
}

declare global {
  // Set by `bin/ov.mjs` before the bundle loads.
  var __omgvibeCommand: string | undefined;
}

export const INVOCATION: Invocation = resolveInvocation({ shim: globalThis.__omgvibeCommand, script: process.argv[1] });

/**
 * A command line for the user to type, starting with the name they started
 * omgvibe with: `cmd('login')` is `ov login` for someone who typed `ov`.
 */
export const cmd = (rest = '', program: string = INVOCATION.program): string => (rest ? `${program} ${rest}` : program);
