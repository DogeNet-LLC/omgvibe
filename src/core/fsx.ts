import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/** File contents, or `null` when the file does not exist. Other errors propagate. */
export async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export interface WriteOptions {
  /** File mode for a newly created file. An existing file keeps its own mode unless `forceMode` is set. */
  mode?: number;
  /** Apply `mode` even when the file already exists (secrets must not stay world-readable). */
  forceMode?: boolean;
  /** Mode for directories this call creates. */
  dirMode?: number;
}

/**
 * Write through a temp file and rename, so a crash or a full disk never leaves
 * a half-written config behind.
 */
export async function writeTextAtomic(file: string, content: string, options: WriteOptions = {}): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true, mode: options.dirMode });

  let mode = options.mode ?? 0o644;
  if (!options.forceMode) {
    try {
      mode = (await fs.stat(file)).mode & 0o777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const temp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temp, content, { encoding: 'utf8', mode });
    // writeFile's mode is filtered by the umask; chmod makes it exact.
    await fs.chmod(temp, mode).catch(() => undefined);
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  const text = await readText(file);
  if (text === null) return null;
  return JSON.parse(text) as T;
}

export async function writeJsonAtomic(file: string, value: unknown, options: WriteOptions = {}): Promise<void> {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`, options);
}

export const exists = (file: string): boolean => existsSync(file);

/** `20261114-213045`, local time: sorts chronologically and is safe in file names. */
export function timestamp(date: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
