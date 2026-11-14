import { constants as osConstants, homedir } from 'node:os';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import path from 'node:path';

import spawn from 'cross-spawn';

const isWindows = process.platform === 'win32';

function isExecutableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    // On Windows the extension decides; there is no execute bit to test.
    if (!isWindows) accessSync(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Directories installers put agents in that are often missing from `PATH` in
 * the shell that is running right now (an installer edits the shell profile,
 * which only takes effect in new shells).
 */
function fallbackDirs(env: NodeJS.ProcessEnv): string[] {
  const home = homedir();
  if (isWindows) {
    return [
      env.APPDATA && path.join(env.APPDATA, 'npm'),
      path.join(home, '.local', 'bin'),
      path.join(home, '.bun', 'bin'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
    ].filter((dir): dir is string => Boolean(dir));
  }
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

/**
 * Finds an executable by name: every `PATH` entry first, then the usual
 * installer locations and any `extraDirs` the agent is known to use.
 * Returns the full path, or `null`.
 */
export function findExecutable(
  names: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  extraDirs: readonly string[] = [],
): string | null {
  const pathDirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  const extensions = isWindows
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((extension) => extension.toLowerCase())
    : [''];
  const dirs = [...pathDirs, ...extraDirs, ...fallbackDirs(env)];
  for (const name of names) {
    for (const dir of dirs) {
      for (const extension of extensions) {
        const candidate = path.join(dir, name + extension);
        if (isExecutableFile(candidate)) return candidate;
      }
    }
  }
  return null;
}

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a command to completion and collects its output. Never throws; a failed start has `code: null`. */
export function capture(
  file: string,
  args: readonly string[],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const child = spawn(file, [...args], { env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, options.timeoutMs ?? 8000);
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', () => done(null));
    child.on('close', (code) => done(code));
  });
}

const signalNumber = (signal: NodeJS.Signals): number => osConstants.signals[signal] ?? 0;

/**
 * Hands the terminal to a child process and resolves with its exit code.
 *
 * Ctrl+C reaches the whole foreground process group, so the child gets it
 * directly. omgvibe has to survive it — agents use Ctrl+C to interrupt a
 * reply, not to quit — and so ignores SIGINT while the child runs. Signals
 * aimed at omgvibe alone (terminal closed, `kill`) are passed on.
 */
export function runInteractive(
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { env, stdio: 'inherit' });
    const ignore = (): void => undefined;
    const forward = (signal: NodeJS.Signals) => (): void => {
      child.kill(signal);
    };
    const forwardTerm = forward('SIGTERM');
    const forwardHup = forward('SIGHUP');
    process.on('SIGINT', ignore);
    process.on('SIGTERM', forwardTerm);
    if (!isWindows) process.on('SIGHUP', forwardHup);
    const release = (): void => {
      process.off('SIGINT', ignore);
      process.off('SIGTERM', forwardTerm);
      process.off('SIGHUP', forwardHup);
    };
    child.on('error', (error) => {
      release();
      reject(error);
    });
    child.on('close', (code, signal) => {
      release();
      resolve(code ?? (signal ? 128 + signalNumber(signal) : 1));
    });
  });
}

/** Pulls the first version-looking token out of `--version` output: `2.1.211 (Claude Code)` → `2.1.211`. */
export function parseVersion(output: string): string | undefined {
  return /\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?/.exec(output)?.[0];
}
