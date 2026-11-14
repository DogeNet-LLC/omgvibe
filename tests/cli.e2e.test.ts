import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MOCK_KEY, type MockGateway, startMockGateway } from './helpers/mock-gateway';

/**
 * Runs the real CLI as a child process against the mock gateway, with stand-in
 * agent executables that record how they were started. Nothing here reaches
 * the network or the developer's own agent configs.
 */

const ROOT = path.resolve(import.meta.dirname, '..');

let gateway: MockGateway;
let sandbox: string;
let binDir: string;
let record: string;

/** A stand-in agent: prints a version, or records its arguments and environment and exits as told. */
const FAKE_AGENT = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('9.9.9 (fake)'); process.exit(0); }
const settingsAt = args.indexOf('--settings');
const configAt = args.indexOf('--config');
const extensionAt = args.indexOf('-e');
const read = (index) => (index === -1 ? null : fs.readFileSync(args[index + 1], 'utf8'));
const env = {};
for (const [name, value] of Object.entries(process.env)) {
  if (/^(ANTHROPIC|CLAUDE|OPENAI|OPENCODE|KILO|OHMYGPT)_/.test(name)) env[name] = value;
}
fs.writeFileSync(process.env.FAKE_AGENT_RECORD, JSON.stringify({ args, env, settings: read(settingsAt), config: read(configAt), extension: read(extensionAt) }));
process.stdout.write('agent output\\n');
process.exit(Number(process.env.FAKE_AGENT_EXIT || 0));
`;

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

function cli(args: string[], env: Record<string, string | undefined> = {}): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src/cli.ts'), ...args], {
      cwd: ROOT,
      env: {
        PATH: `${binDir}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
        HOME: path.join(sandbox, 'home'),
        OMGVIBE_HOME: path.join(sandbox, 'omgvibe'),
        OMGVIBE_USER_HOME: path.join(sandbox, 'home'),
        OMGVIBE_NO_UPDATE_CHECK: '1',
        OHMYGPT_BASE_URL: gateway.url,
        FAKE_AGENT_RECORD: record,
        LANG: 'en_US.UTF-8',
        NO_COLOR: '1',
        ...env,
      } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const recorded = async (): Promise<{ args: string[]; env: Record<string, string>; settings: string | null; config: string | null; extension: string | null }> =>
  JSON.parse(await fs.readFile(record, 'utf8'));

const signedIn = { OHMYGPT_API_KEY: MOCK_KEY };

beforeAll(async () => {
  gateway = await startMockGateway();
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'omgvibe-e2e-'));
  binDir = path.join(sandbox, 'bin');
  record = path.join(sandbox, 'record.json');
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(path.join(sandbox, 'home'), { recursive: true });
  for (const name of ['claude', 'codex', 'opencode', 'pi', 'codewhale']) {
    await fs.writeFile(path.join(binDir, name), FAKE_AGENT, { mode: 0o755 });
  }
}, 30_000);

afterAll(async () => {
  await gateway.close();
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('basics', () => {
  it('prints the version and the help', async () => {
    expect((await cli(['--version'])).stdout.trim()).toBe('dev');
    const help = await cli(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('omgvibe <agent> [args…]');
    expect(help.stdout).toContain('Claude Code');
    expect((await cli(['--lang', 'zh', 'help'])).stdout).toContain('打开交互菜单');
    expect((await cli(['help'], { LANG: 'ja_JP.UTF-8' })).stdout).toContain('対話メニューを開く');
  });

  it('rejects an unknown command with a suggestion, and a bad option', async () => {
    const typo = await cli(['claud']);
    expect(typo.code).toBe(2);
    expect(typo.stderr).toContain('Unknown command or agent: claud');
    expect(typo.stderr).toContain('omgvibe claude');
    expect((await cli(['--nope'])).code).toBe(2);
    expect((await cli(['--lang', 'xx', 'status'])).stderr).toContain('Unsupported language: xx');
  });

  it('without a terminal, a bare call prints the help instead of opening the menu', async () => {
    const bare = await cli([]);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toContain('Usage');
  });
});

describe('launching an agent', () => {
  it('says how to sign in when there is no key', async () => {
    const result = await cli(['claude', '-p', 'hi']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No API key yet.');
    expect(result.stderr).toContain('omgvibe login');
  });

  it('starts Claude Code with a session settings file, passes arguments through and returns its exit code', async () => {
    const result = await cli(['claude', '-p', 'hi there', '--verbose'], { ...signedIn, ANTHROPIC_API_KEY: 'sk-ant-real', FAKE_AGENT_EXIT: '7' });
    expect(result.code).toBe(7);
    expect(result.stdout).toBe('agent output\n');
    const run = await recorded();
    expect(run.args.slice(2)).toEqual(['-p', 'hi there', '--verbose']);
    expect(run.args[0]).toBe('--settings');
    expect(JSON.parse(run.settings!)).toMatchObject({ env: { ANTHROPIC_BASE_URL: gateway.url, ANTHROPIC_AUTH_TOKEN: MOCK_KEY } });
    expect(run.env.ANTHROPIC_AUTH_TOKEN).toBe(MOCK_KEY);
    expect(run.env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(run.env).not.toHaveProperty('ANTHROPIC_MODEL');
    // The session file is gone once the agent has exited.
    await expect(fs.access(run.args[1]!)).rejects.toThrow();
    expect(await fs.readdir(path.join(sandbox, 'omgvibe', 'run'))).toEqual([]);
  });

  it('gives Codex the catalog default model and a provider defined on the command line', async () => {
    const result = await cli(['codex', 'exec', 'fix it'], signedIn);
    expect(result.code).toBe(0);
    const run = await recorded();
    expect(run.args.slice(-2)).toEqual(['exec', 'fix it']);
    expect(run.args).toContain('model="openai/gpt-5.5"');
    expect(run.args).toContain(`model_providers.omgvibe.base_url="${gateway.url}/v1"`);
    expect(run.env.OHMYGPT_API_KEY).toBe(MOCK_KEY);
  });

  it('corrects a mistyped model, passes an unknown one through, and refuses one the agent cannot reach', async () => {
    const corrected = await cli(['codex', '--model', 'zhipu/gml-5.3'], signedIn);
    expect(corrected.stderr).toContain('Using zhipu/glm-5.3 (you typed zhipu/gml-5.3).');
    expect((await recorded()).args).toContain('model="zhipu/glm-5.3"');

    const unknown = await cli(['codex', '--model', 'vendor/unreleased'], signedIn);
    expect(unknown.code).toBe(0);
    expect(unknown.stderr).toContain('vendor/unreleased is not in the model list');
    expect((await recorded()).args).toContain('model="vendor/unreleased"');

    const wrong = await cli(['claude', '--model', 'openai/text-embedding-3-large'], signedIn);
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain('does not accept Anthropic Messages requests');

    const retiring = await cli(['claude', '--model', 'anthropic/claude-sonnet-4-5'], signedIn);
    expect(retiring.code).toBe(0);
    expect(retiring.stderr).toContain('stops working on 2026-11-30');
    expect(retiring.stderr).toContain('anthropic/claude-sonnet-5-5');
  });

  it('explains how to install an agent that is missing, without installing anything', async () => {
    const result = await cli(['kilo'], signedIn);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Kilo Code is not installed.');
    expect(result.stderr).toContain('npm install -g @kilocode/cli');
  });

  it('layers the session config for CodeWhale on top of the user\'s own', async () => {
    const dir = path.join(sandbox, 'home', '.codewhale');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'config.toml'), '# mine\napproval_policy = "never"\n');
    await cli(['codewhale', '--model', 'zhipu/glm-5.3', 'exec', 'x'], signedIn);
    const run = await recorded();
    expect(run.config).toContain('# mine');
    expect(run.config).toContain('approval_policy = "never"');
    expect(run.config).toContain('api_key_env = "OHMYGPT_API_KEY"');
    expect(run.config).not.toContain(MOCK_KEY);
    // The user's own file is untouched.
    expect(await fs.readFile(path.join(dir, 'config.toml'), 'utf8')).toBe('# mine\napproval_policy = "never"\n');
  });
});

describe('account and diagnostics', () => {
  it('signs in non-interactively, reports status, and signs out', async () => {
    const rejected = await cli(['login', '--key', 'sk-wrong']);
    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toContain('did not accept this key');

    const login = await cli(['login', '--key', MOCK_KEY]);
    expect(login.code).toBe(0);
    expect(login.stdout).toContain('Key accepted: account #4242');
    const configFile = path.join(sandbox, 'omgvibe', 'config.json');
    expect((await fs.stat(configFile)).mode & 0o777).toBe(0o600);

    const status = JSON.parse((await cli(['status', '--json'])).stdout) as {
      account: { valid: boolean; source: string; key: string };
      agents: Array<{ id: string; installed: boolean; version: string | null }>;
    };
    expect(status.account).toMatchObject({ valid: true, source: 'saved' });
    expect(status.account.key).not.toBe(MOCK_KEY);
    expect(status.agents.find((agent) => agent.id === 'claude')).toMatchObject({ installed: true, version: '9.9.9' });
    expect(status.agents.find((agent) => agent.id === 'kilo')).toMatchObject({ installed: false });

    expect((await cli(['logout'])).stdout).toContain('Removed the saved key.');
    expect((await cli(['logout'])).stdout).toContain('No saved key to remove.');
  });

  it('checks every protocol with doctor, and fails clearly on a bad key', async () => {
    const ok = JSON.parse((await cli(['doctor', '--json'], signedIn)).stdout) as { ok: boolean; checks: Array<{ ok: boolean }> };
    expect(ok.ok).toBe(true);
    expect(ok.checks).toHaveLength(6);
    const bad = await cli(['doctor'], { OHMYGPT_API_KEY: 'sk-wrong' });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain('1 check failed.');
  });

  it('lists and searches models', async () => {
    const table = await cli(['models', 'claude']);
    expect(table.stdout).toContain('anthropic/claude-sonnet-5-5');
    expect(table.stdout).not.toContain('openai/gpt-5.5');
    expect(table.stdout).not.toContain('ohmygpt/mock');
    const all = JSON.parse((await cli(['models', '--all', '--json'])).stdout) as Array<{ id: string }>;
    expect(all.map((model) => model.id)).toContain('openai/text-embedding-3-large');
    expect((await cli(['models', 'no-such-model'])).stdout).toContain('No models match.');
  });

  it('pins an endpoint by region name', async () => {
    const pinned = await cli(['endpoint', 'cn2'], { OHMYGPT_BASE_URL: undefined });
    expect(pinned.stdout).toContain('https://cn2us02.opapi.win');
    const config = JSON.parse(await fs.readFile(path.join(sandbox, 'omgvibe', 'config.json'), 'utf8')) as Record<string, unknown>;
    expect(config).toMatchObject({ endpoint: 'https://cn2us02.opapi.win', endpointPinned: true });
    expect((await cli(['endpoint', 'not a url'])).code).toBe(1);
  });
});

describe('setup and reset', () => {
  it('writes into the agents\' own configs and takes it back out', async () => {
    const home = path.join(sandbox, 'home');
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    const codexOriginal = '# mine\nmodel = "gpt-5.5"\n';
    await fs.writeFile(path.join(home, '.codex', 'config.toml'), codexOriginal);

    const setup = await cli(['setup', 'claude', 'codex', '--yes', '--model', 'zhipu/glm-5.3'], signedIn);
    expect(setup.code).toBe(0);
    expect(setup.stdout).toContain('Claude Code now uses OhMyGPT');
    expect(setup.stdout).not.toContain(MOCK_KEY);

    const claudeSettings = JSON.parse(await fs.readFile(path.join(home, '.claude', 'settings.json'), 'utf8')) as { env: Record<string, string> };
    expect(claudeSettings.env).toMatchObject({ ANTHROPIC_BASE_URL: gateway.url, ANTHROPIC_MODEL: 'zhipu/glm-5.3' });
    const codexConfig = await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(codexConfig).toContain('# mine');
    expect(codexConfig).toContain('model = "zhipu/glm-5.3"');
    expect(codexConfig).toContain('[model_providers.ohmygpt]');

    const unsupported = await cli(['setup', 'qwen', '--yes'], signedIn);
    expect(unsupported.code).toBe(1);
    expect(unsupported.stderr).toContain('cannot be set up permanently');

    const reset = await cli(['reset']);
    expect(reset.code).toBe(0);
    expect(reset.stdout).toContain('Codex is back to its own configuration.');
    expect(await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8')).toBe(codexOriginal);
    await expect(fs.access(path.join(home, '.claude', 'settings.json'))).rejects.toThrow();
    expect((await cli(['reset'])).stdout).toContain('Nothing to undo');
  });

  it('leaves a config it cannot parse untouched and says what to do', async () => {
    const dir = path.join(sandbox, 'home', '.pi', 'agent');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'models.json'), '{ broken');
    const result = await cli(['setup', 'pi', '--yes'], signedIn);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('~/.pi/agent/models.json');
    expect(result.stderr).toContain('omgvibe pi');
    expect(await fs.readFile(path.join(dir, 'models.json'), 'utf8')).toBe('{ broken');
  });
});
