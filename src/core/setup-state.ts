import fs from 'node:fs/promises';
import path from 'node:path';

import type { FileEdit } from '../agents/types';
import { maskKey } from './account';
import { applyOps, ConfigEditError, type EditOp, type Format, revertOps, type UndoOp } from './edits';
import { exists, readJson, readText, timestamp, writeJsonAtomic, writeTextAtomic } from './fsx';
import { paths } from './paths';
import { parseToml, renderKey, renderValue, type TomlValue } from './toml-edit';

/**
 * Bookkeeping for `setup` and `reset`: which files were edited for which
 * agent, what each edit replaced, and where the pre-setup copy of each file
 * is kept.
 */

export interface FileRecord {
  path: string;
  format: Format;
  /** True when the file did not exist before the first setup. */
  created: boolean;
  /** Copy of the file as it was before the first setup; absent when the file was created. */
  backup?: string;
  undo: UndoOp[];
}

export interface AgentSetup {
  appliedAt: number;
  endpoint: string;
  model?: string;
  files: FileRecord[];
}

export interface SetupState {
  agents: Record<string, AgentSetup>;
}

export async function loadSetupState(env: NodeJS.ProcessEnv = process.env): Promise<SetupState> {
  try {
    const state = await readJson<SetupState>(paths(env).setupState);
    if (state && typeof state.agents === 'object' && state.agents !== null) return state;
  } catch {
    // An unreadable record cannot be trusted; treat it as empty rather than fail every command.
  }
  return { agents: {} };
}

const saveSetupState = (state: SetupState, env: NodeJS.ProcessEnv): Promise<void> =>
  writeJsonAtomic(paths(env).setupState, state, { mode: 0o600, forceMode: true, dirMode: 0o700 });

// ---------------------------------------------------------------------------
// describing a plan
// ---------------------------------------------------------------------------

const mask = (text: string, apiKey: string): string => (apiKey ? text.split(apiKey).join(maskKey(apiKey)) : text);

const clip = (text: string, max = 72): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** One line per setting an edit will write, with the API key masked. */
export function describeOps(ops: readonly EditOp[], apiKey: string): string[] {
  return ops.flatMap((op) => {
    if (op.kind === 'json-set') {
      return [`${op.path.join('.')} = ${clip(mask(JSON.stringify(op.value), apiKey))}`];
    }
    if (op.kind === 'toml-set') return [`${renderKey(op.key)} = ${renderValue(op.value)}`];
    return [
      `[${op.table.map(renderKey).join('.')}]`,
      ...Object.entries(op.entries).map(
        ([key, value]) => `  ${renderKey(key)} = ${clip(mask(renderValue(value as TomlValue), apiKey))}`,
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export interface PlannedFile {
  /** The file that will be written (an existing alternative name wins over the default). */
  path: string;
  /** Whether it exists now. */
  exists: boolean;
  edit: FileEdit;
}

/** Resolves which file each edit targets, without touching anything. */
export function planFiles(edits: readonly FileEdit[]): PlannedFile[] {
  return edits.map((edit) => {
    const target = exists(edit.path) ? edit.path : ((edit.alternatives ?? []).find(exists) ?? edit.path);
    return { path: target, exists: exists(target), edit };
  });
}

export class SetupError extends Error {
  constructor(
    readonly file: string,
    readonly reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = 'SetupError';
  }
}

export interface AppliedFile {
  path: string;
  backup?: string;
  created: boolean;
}

/**
 * Applies an agent's setup edits. Every file is computed and verified in
 * memory first, and nothing is written unless all of them succeed. Running
 * setup again first takes back the previous run's values, so `reset` always
 * returns to the state before the first run.
 */
export async function applySetup(
  agentId: string,
  edits: readonly FileEdit[],
  meta: { endpoint: string; model?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppliedFile[]> {
  const state = await loadSetupState(env);
  const previous = state.agents[agentId];
  const stamp = timestamp();

  const staged: Array<{ plan: PlannedFile; text: string; record: FileRecord; before: string | null }> = [];
  for (const plan of planFiles(edits)) {
    const before = await readText(plan.path);
    const earlier = previous?.files.find((file) => file.path === plan.path);
    try {
      let base = before;
      if (earlier && before !== null) base = revertOps(plan.edit.format, before, earlier.undo).text;
      const { text, undo } = applyOps(plan.edit.format, base, plan.edit.ops);
      staged.push({
        plan,
        text,
        before,
        record: {
          path: plan.path,
          format: plan.edit.format,
          created: earlier ? earlier.created : before === null,
          backup: earlier?.backup,
          undo,
        },
      });
    } catch (error) {
      if (error instanceof ConfigEditError) throw new SetupError(plan.path, error.message);
      throw error;
    }
  }

  const applied: AppliedFile[] = [];
  for (const { plan, text, record, before } of staged) {
    if (before !== null && !record.backup) {
      record.backup = path.join(paths(env).backups, agentId, stamp, path.basename(plan.path));
      await writeTextAtomic(record.backup, before, { mode: 0o600, forceMode: true, dirMode: 0o700 });
    }
    await writeTextAtomic(plan.path, text, plan.edit.secret ? { mode: 0o600, forceMode: true } : {});
    applied.push({ path: plan.path, backup: record.backup, created: record.created });
  }

  // Files an earlier run edited that this run no longer touches are put back now.
  for (const stale of previous?.files ?? []) {
    if (staged.some((entry) => entry.record.path === stale.path)) continue;
    await revertFile(stale).catch(() => undefined);
  }

  state.agents[agentId] = { appliedAt: Date.now(), endpoint: meta.endpoint, model: meta.model, files: staged.map((entry) => entry.record) };
  await saveSetupState(state, env);
  return applied;
}

// ---------------------------------------------------------------------------
// revert
// ---------------------------------------------------------------------------

export type RevertedFile =
  | { path: string; outcome: 'reverted'; reverted: string[]; kept: string[]; backup?: string }
  | { path: string; outcome: 'removed'; backup?: string }
  | { path: string; outcome: 'missing' }
  | { path: string; outcome: 'failed'; reason: string; backup?: string };

/** True when nothing but whitespace, comments or an empty object is left in the file. */
function isEffectivelyEmpty(format: Format, text: string): boolean {
  try {
    if (format === 'toml') return Object.keys(parseToml(text)).length === 0 && !/^\s*[^#\s]/m.test(text);
    const value: unknown = text.trim() === '' ? {} : JSON.parse(text);
    return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
  } catch {
    return false;
  }
}

/** Two texts that differ in nothing but whitespace. */
const sameIgnoringWhitespace = (a: string, b: string): boolean => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

async function revertFile(record: FileRecord): Promise<RevertedFile> {
  const text = await readText(record.path);
  if (text === null) return { path: record.path, outcome: 'missing' };
  try {
    const result = revertOps(record.format, text, record.undo);
    if (record.created && result.kept.length === 0 && isEffectivelyEmpty(record.format, result.text)) {
      await fs.rm(record.path, { force: true });
      return { path: record.path, outcome: 'removed', backup: record.backup };
    }
    // Taking settings out can leave the layout a little different from how the
    // user had it (an inline object re-wrapped, say). When that is the only
    // difference from the pre-setup copy, put the copy back byte for byte.
    const original = record.backup ? await readText(record.backup).catch(() => null) : null;
    if (original !== null && sameIgnoringWhitespace(original, result.text)) result.text = original;
    if (result.text !== text) await writeTextAtomic(record.path, result.text);
    return { path: record.path, outcome: 'reverted', reverted: result.reverted, kept: result.kept, backup: record.backup };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { path: record.path, outcome: 'failed', reason, backup: record.backup };
  }
}

/**
 * Undoes an agent's setup and forgets it. A file that could not be undone
 * keeps its record, so `reset` can be run again once the file is fixed.
 */
export async function revertSetup(agentId: string, env: NodeJS.ProcessEnv = process.env): Promise<RevertedFile[] | null> {
  const state = await loadSetupState(env);
  const setup = state.agents[agentId];
  if (!setup) return null;
  const results: RevertedFile[] = [];
  const unresolved: FileRecord[] = [];
  for (const record of setup.files) {
    const result = await revertFile(record);
    results.push(result);
    if (result.outcome === 'failed') unresolved.push(record);
  }
  if (unresolved.length > 0) state.agents[agentId] = { ...setup, files: unresolved };
  else delete state.agents[agentId];
  await saveSetupState(state, env);
  return results;
}
