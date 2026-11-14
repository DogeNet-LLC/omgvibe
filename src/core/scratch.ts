import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Scratch } from '../agents/types';
import { paths } from './paths';

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * A private directory for files handed to one agent session (a settings file
 * holding the key, for instance). It is removed when the session ends; as a
 * backstop it is also removed when omgvibe exits for any other reason.
 */
export class SessionScratch implements Scratch {
  private dir: string | null = null;
  private readonly onExit = (): void => this.disposeSync();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async file(name: string, content: string): Promise<string> {
    if (!this.dir) {
      const root = paths(this.env).run;
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      this.dir = path.join(root, `${process.pid}-${randomBytes(4).toString('hex')}`);
      await fs.mkdir(this.dir, { mode: 0o700 });
      process.once('exit', this.onExit);
    }
    const file = path.join(this.dir, name);
    await fs.writeFile(file, content, { encoding: 'utf8', mode: 0o600 });
    return file;
  }

  disposeSync(): void {
    process.off('exit', this.onExit);
    if (!this.dir) return;
    rmSync(this.dir, { recursive: true, force: true });
    this.dir = null;
  }
}

/**
 * Removes session directories whose owning process is gone (a crash or a
 * killed terminal can leave one behind, with a key in it).
 */
export function sweepStaleScratch(env: NodeJS.ProcessEnv = process.env): void {
  const root = paths(env).run;
  if (!existsSync(root)) return;
  try {
    for (const entry of readdirSync(root)) {
      const pid = Number(entry.split('-')[0]);
      if (Number.isInteger(pid) && pid > 0 && !isAlive(pid)) {
        rmSync(path.join(root, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Housekeeping only; never worth failing a command over.
  }
}
