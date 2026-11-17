import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FileEdit } from '../src/agents/types';
import { applySetup, describeOps, loadSetupState, revertSetup, SetupError } from '../src/core/setup-state';

let root: string;
let env: NodeJS.ProcessEnv;
const file = (name: string): string => path.join(root, 'user', name);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'omgvibe-setup-'));
  await fs.mkdir(path.join(root, 'user'), { recursive: true });
  env = { OMGVIBE_HOME: path.join(root, 'omgvibe') };
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

const jsonEdit = (name: string, values: Record<string, string>): FileEdit => ({
  path: file(name),
  format: 'json',
  secret: true,
  ops: Object.entries(values).map(([key, value]) => ({ kind: 'json-set' as const, path: ['env', key], value })),
});

describe('applySetup / revertSetup', () => {
  it('edits an existing file, keeps a copy, and reset puts the file back byte for byte', async () => {
    const original = '{\n  // mine\n  "env": { "MINE": "1" }\n}\n';
    await fs.writeFile(file('settings.json'), original);
    const [applied] = await applySetup('claude', [jsonEdit('settings.json', { BASE: 'https://api.ohmygpt.com', TOKEN: 'sk-1' })], { endpoint: 'e' }, env);

    expect(applied!.created).toBe(false);
    expect(await fs.readFile(applied!.backup!, 'utf8')).toBe(original);
    expect((await fs.stat(file('settings.json'))).mode & 0o777).toBe(0o600);
    expect(JSON.stringify((await loadSetupState(env)).agents.claude)).not.toContain('"MINE"');

    const [reverted] = (await revertSetup('claude', env))!;
    expect(reverted).toMatchObject({ outcome: 'reverted', reverted: ['env.TOKEN', 'env.BASE'], kept: [] });
    expect(await fs.readFile(file('settings.json'), 'utf8')).toBe(original);
    expect((await loadSetupState(env)).agents).toEqual({});
  });

  it('removes a file it created once nothing of the user is in it', async () => {
    const [applied] = await applySetup('claude', [jsonEdit('new.json', { BASE: 'x' })], { endpoint: 'e' }, env);
    expect(applied).toMatchObject({ created: true, backup: undefined });
    const [reverted] = (await revertSetup('claude', env))!;
    expect(reverted!.outcome).toBe('removed');
    await expect(fs.access(file('new.json'))).rejects.toThrow();
  });

  it('keeps a created file that the user has since added to', async () => {
    await applySetup('claude', [jsonEdit('new.json', { BASE: 'x' })], { endpoint: 'e' }, env);
    const current = JSON.parse(await fs.readFile(file('new.json'), 'utf8')) as Record<string, unknown>;
    await fs.writeFile(file('new.json'), JSON.stringify({ ...current, theirs: true }, null, 2));
    const [reverted] = (await revertSetup('claude', env))!;
    expect(reverted!.outcome).toBe('reverted');
    expect(JSON.parse(await fs.readFile(file('new.json'), 'utf8'))).toEqual({ theirs: true });
  });

  it('running setup twice still resets to the state before the first run', async () => {
    const original = '{\n  "env": {\n    "BASE": "the-users-own"\n  }\n}\n';
    await fs.writeFile(file('settings.json'), original);
    await applySetup('claude', [jsonEdit('settings.json', { BASE: 'first', MODEL: 'a' })], { endpoint: 'e' }, env);
    // The second run drops MODEL: the stale key must go, and BASE's original must be remembered.
    await applySetup('claude', [jsonEdit('settings.json', { BASE: 'second' })], { endpoint: 'e' }, env);
    expect(JSON.parse(await fs.readFile(file('settings.json'), 'utf8'))).toEqual({ env: { BASE: 'second' } });
    await revertSetup('claude', env);
    expect(await fs.readFile(file('settings.json'), 'utf8')).toBe(original);
  });

  it('changes nothing at all when one of several files cannot be edited', async () => {
    await fs.writeFile(file('good.json'), '{}\n');
    await fs.writeFile(file('broken.json'), '{ not json');
    const attempt = applySetup('pi', [jsonEdit('good.json', { A: '1' }), jsonEdit('broken.json', { B: '2' })], { endpoint: 'e' }, env);
    await expect(attempt).rejects.toBeInstanceOf(SetupError);
    await expect(attempt).rejects.toMatchObject({ file: file('broken.json') });
    expect(await fs.readFile(file('good.json'), 'utf8')).toBe('{}\n');
    expect((await loadSetupState(env)).agents).toEqual({});
  });

  it('edits the alternative file name when that is the one that exists', async () => {
    await fs.writeFile(file('config.jsonc'), '{\n  // jsonc\n}\n');
    const edit: FileEdit = { ...jsonEdit('config.json', { A: '1' }), alternatives: [file('config.jsonc')] };
    const [applied] = await applySetup('opencode', [edit], { endpoint: 'e' }, env);
    expect(applied!.path).toBe(file('config.jsonc'));
    await expect(fs.access(file('config.json'))).rejects.toThrow();
  });

  it('reports a file that disappeared, and that there is nothing to undo for an agent never set up', async () => {
    await applySetup('claude', [jsonEdit('gone.json', { A: '1' })], { endpoint: 'e' }, env);
    await fs.rm(file('gone.json'));
    expect((await revertSetup('claude', env))![0]!.outcome).toBe('missing');
    expect(await revertSetup('codex', env)).toBeNull();
  });
});

describe('describeOps', () => {
  it('lists each setting and masks the key wherever it appears', () => {
    const lines = describeOps(
      [
        { kind: 'json-set', path: ['env', 'TOKEN'], value: 'sk-0123456789abcdefwxyz' },
        { kind: 'toml-set', key: 'model', value: 'openai/gpt-5.5' },
        { kind: 'toml-table', table: ['model_providers', 'ohmygpt'], entries: { experimental_bearer_token: 'sk-0123456789abcdefwxyz' } },
      ],
      'sk-0123456789abcdefwxyz',
    );
    expect(lines).toEqual([
      'env.TOKEN = "sk-012…wxyz"',
      'model = "openai/gpt-5.5"',
      '[model_providers.ohmygpt]',
      '  experimental_bearer_token = "sk-012…wxyz"',
    ]);
  });
});
