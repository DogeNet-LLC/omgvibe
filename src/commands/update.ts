import { realpathSync } from 'node:fs';

import spawn from 'cross-spawn';

import { httpRequest, parseJson } from '../core/http';
import { loadConfig, updateConfig } from '../core/store';
import { CliError, note } from '../core/ui';
import { PACKAGE_NAME, VERSION } from '../core/version';
import { t } from '../i18n';

const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** Compares dotted numeric versions; a prerelease suffix is ignored. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (version: string): number[] => version.split('-')[0]!.split('.').map((part) => Number(part) || 0);
  const [a, b] = [parse(candidate), parse(current)];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return false;
}

async function fetchLatest(env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string | null> {
  try {
    const response = await httpRequest(REGISTRY_URL, { timeoutMs, env });
    const version = parseJson<{ version?: string }>(response)?.version;
    return response.status === 200 && typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/** True when this process was started by `npx` (its cache lives under `_npx`). */
function runningFromNpx(): boolean {
  try {
    return realpathSync(process.argv[1] ?? '').split(/[\\/]/).includes('_npx');
  } catch {
    return false;
  }
}

const updateCommandLine = (): string => (runningFromNpx() ? `npx ${PACKAGE_NAME}@latest` : `npm install -g ${PACKAGE_NAME}@latest`);

/**
 * Looks for a newer release at most once a day, in the background, and never
 * lets a slow registry hold anything up. The result is shown on a later run.
 */
export function refreshUpdateInfo(env: NodeJS.ProcessEnv = process.env): void {
  if (VERSION === 'dev' || env.OMGVIBE_NO_UPDATE_CHECK || env.CI) return;
  void (async () => {
    const config = await loadConfig(env);
    if (Date.now() - (config.updateCheckedAt ?? 0) < CHECK_EVERY_MS) return;
    const latest = await fetchLatest(env, 3000);
    await updateConfig((current) => {
      current.updateCheckedAt = Date.now();
      if (latest) current.latestVersion = latest;
    }, env);
  })().catch(() => undefined);
}

/** Mentions a newer release found by an earlier check. Only for a person at a terminal. */
export async function announceUpdate(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (VERSION === 'dev' || !process.stderr.isTTY || env.OMGVIBE_NO_UPDATE_CHECK || env.CI) return;
  try {
    const { latestVersion } = await loadConfig(env);
    if (latestVersion && isNewer(latestVersion, VERSION)) {
      note.info(`${t().updateAvailable(latestVersion, VERSION)} ${t().updateHow(updateCommandLine())}`);
    }
  } catch {
    // A notice is never worth an error.
  }
}

/** `omgvibe update`: installs the newest release when omgvibe is installed globally. */
export async function updateCommand(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  note.info(t().updateChecking);
  const latest = await fetchLatest(env, 15_000);
  if (!latest) throw new CliError(t().updateCheckFailed);
  await updateConfig((config) => {
    config.updateCheckedAt = Date.now();
    config.latestVersion = latest;
  }, env).catch(() => undefined);

  if (!isNewer(latest, VERSION)) {
    process.stdout.write(`${t().updateLatest(VERSION)}\n`);
    return;
  }
  process.stdout.write(`${t().updateAvailable(latest, VERSION)}\n`);
  if (runningFromNpx()) {
    process.stdout.write(`${t().updateNpx}\n`);
    return;
  }
  const command = `npm install -g ${PACKAGE_NAME}@latest`;
  note.info(t().updateRunning(command));
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn('npm', ['install', '-g', `${PACKAGE_NAME}@latest`], { stdio: 'inherit', env });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
  if (!ok) throw new CliError(t().updateFailed(command));
  process.stdout.write(`${t().updateDone(latest)}\n`);
}
