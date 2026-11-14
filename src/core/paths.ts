import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Everything omgvibe keeps on disk lives under one directory, `~/.omgvibe` by
 * default. `OMGVIBE_HOME` moves it (tests use this to stay out of the real one).
 */
export function omgvibeHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OMGVIBE_HOME?.trim();
  return override ? path.resolve(override) : path.join(homedir(), '.omgvibe');
}

/**
 * The home directory agent configs are resolved against. `OMGVIBE_USER_HOME`
 * redirects it so tests can exercise `setup` and `reset` on a scratch tree.
 */
export function userHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OMGVIBE_USER_HOME?.trim();
  return override ? path.resolve(override) : homedir();
}

export interface Paths {
  home: string;
  /** API key, chosen endpoint, language and remembered models. Mode 0600. */
  config: string;
  /** Slimmed copy of the live model catalog. */
  catalogCache: string;
  /** What `setup` changed, so `reset` can put it back. */
  setupState: string;
  /** Timestamped copies of every file `setup` touches. */
  backups: string;
  /** Per-session files handed to an agent (removed when it exits). */
  run: string;
}

export function paths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = omgvibeHome(env);
  return {
    home,
    config: path.join(home, 'config.json'),
    catalogCache: path.join(home, 'cache', 'models.json'),
    setupState: path.join(home, 'setup-state.json'),
    backups: path.join(home, 'backups'),
    run: path.join(home, 'run'),
  };
}

/** `/Users/me/.codex/config.toml` → `~/.codex/config.toml`, for display only. */
export function tildify(file: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = userHome(env);
  if (file === home) return '~';
  return file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file;
}
