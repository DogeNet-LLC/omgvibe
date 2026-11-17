import { parse as parseTomlText } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { AGENTS, findAgent } from '../src/agents';
import type { AgentDefinition, FileEdit, LaunchInput, LaunchPlan, Scratch } from '../src/agents/types';
import { agentModels, type Model, toModel } from '../src/core/catalog';
import { applyOps } from '../src/core/edits';
import { MOCK_MODELS } from './helpers/mock-gateway';

const catalog: Model[] = (MOCK_MODELS as Array<{ id: string }>).map((raw) => toModel(raw));
const entry = (id: string): { id: string; entry: Model } => ({ id, entry: catalog.find((model) => model.id === id)! });
const ATTRIBUTION = { 'HTTP-Referer': 'https://example.test/omgvibe', 'X-OhMyGPT-Title': 'Test Agent' };
const KEY = 'sk-test-key';
const ENDPOINT = 'https://api.ohmygpt.com';

/** Collects scratch files in memory instead of writing them. */
function fakeScratch(): Scratch & { files: Record<string, string> } {
  const files: Record<string, string> = {};
  return {
    files,
    file: async (name, content) => {
      files[name] = content;
      return `/scratch/${name}`;
    },
  };
}

async function launch(
  id: string,
  overrides: Partial<LaunchInput> = {},
): Promise<{ plan: LaunchPlan; files: Record<string, string>; agent: AgentDefinition }> {
  const agent = findAgent(id)!;
  const scratch = fakeScratch();
  const plan = await agent.launch({
    endpoint: ENDPOINT,
    apiKey: KEY,
    models: agentModels(catalog, agent.protocol),
    userArgs: ['--user-flag', 'value'],
    home: '/home/test',
    env: {},
    scratch,
    attribution: ATTRIBUTION,
    ...overrides,
  });
  return { plan, files: scratch.files, agent };
}

const setupEdits = (id: string, model?: { id: string; entry?: Model }): FileEdit[] => {
  const agent = findAgent(id)!;
  return agent.setup!({
    endpoint: ENDPOINT,
    apiKey: KEY,
    model,
    models: agentModels(catalog, agent.protocol),
    home: '/home/test',
    env: {},
    attribution: ATTRIBUTION,
  });
};

describe('registry', () => {
  it('has unique command names and resolves aliases', () => {
    const names = AGENTS.flatMap((agent) => [agent.id, ...(agent.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    expect(findAgent('CC')?.id).toBe('claude');
    expect(findAgent('kilocode')?.id).toBe('kilo');
    expect(findAgent('nope')).toBeUndefined();
  });

  it('gives every agent an install method for each platform and a default model to try', () => {
    for (const agent of AGENTS) {
      for (const platform of ['darwin', 'linux', 'win32'] as const) {
        const usable = agent.install.filter((method) => !method.platforms || method.platforms.includes(platform));
        expect(usable.length, `${agent.id} on ${platform}`).toBeGreaterThan(0);
      }
      expect(agent.preferredModels.length).toBeGreaterThan(0);
    }
  });

  it('always puts the user arguments last, untouched', async () => {
    for (const agent of AGENTS) {
      const { plan } = await launch(agent.id, { model: entry('zhipu/glm-5.3') });
      expect(plan.args.slice(-2), agent.id).toEqual(['--user-flag', 'value']);
    }
  });
});

describe('claude', () => {
  it('with no model, only points Claude Code at the gateway and leaves its own model choice alone', async () => {
    const { plan, files } = await launch('claude');
    const settings = JSON.parse(files['claude-settings.json']!) as { env: Record<string, string> };
    expect(settings.env).toEqual({
      ANTHROPIC_BASE_URL: ENDPOINT,
      ANTHROPIC_AUTH_TOKEN: KEY,
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
      ANTHROPIC_CUSTOM_HEADERS: 'HTTP-Referer: https://example.test/omgvibe\nX-OhMyGPT-Title: Test Agent',
    });
    expect(plan.args.slice(0, 2)).toEqual(['--settings', '/scratch/claude-settings.json']);
    // A real Anthropic key in the shell must not travel to another host.
    expect(plan.env).toHaveProperty('ANTHROPIC_API_KEY', undefined);
    expect(plan.env.ANTHROPIC_AUTH_TOKEN).toBe(KEY);
  });

  it('with a Claude model, sets only the main model', async () => {
    const { files } = await launch('claude', { model: entry('anthropic/claude-haiku-5-5') });
    const { env } = JSON.parse(files['claude-settings.json']!) as { env: Record<string, string> };
    expect(env.ANTHROPIC_MODEL).toBe('anthropic/claude-haiku-5-5');
    expect(env).not.toHaveProperty('ANTHROPIC_DEFAULT_HAIKU_MODEL');
    expect(env).not.toHaveProperty('CLAUDE_CODE_MAX_CONTEXT_TOKENS');
  });

  it('with another model, points every alias at it and states its real context window', async () => {
    const { files } = await launch('claude', { model: entry('zhipu/glm-5.3') });
    const { env } = JSON.parse(files['claude-settings.json']!) as { env: Record<string, string> };
    expect(env).toMatchObject({
      ANTHROPIC_MODEL: 'zhipu/glm-5.3',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'zhipu/glm-5.3',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'zhipu/glm-5.3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'zhipu/glm-5.3',
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1048576',
    });
  });

  it('setup edits only its own keys under env', () => {
    const [edit] = setupEdits('claude', entry('zhipu/glm-5.3'));
    expect(edit!.path).toBe('/home/test/.claude/settings.json');
    expect(edit!.secret).toBe(true);
    expect(edit!.ops.every((op) => op.kind === 'json-set' && op.path[0] === 'env')).toBe(true);
  });
});

describe('codex', () => {
  const overridesOf = (plan: LaunchPlan): Record<string, unknown> => {
    const pairs: string[] = [];
    for (let i = 0; i < plan.args.length - 2; i += 2) {
      expect(plan.args[i]).toBe('-c');
      pairs.push(plan.args[i + 1]!);
    }
    // Each override is `dotted.key=<TOML value>`, so together they are a TOML document.
    return parseTomlText(pairs.join('\n')) as Record<string, unknown>;
  };

  it('defines a session-only provider through -c overrides and passes the key by environment', async () => {
    const { plan } = await launch('codex', { model: entry('openai/gpt-5.5') });
    expect(overridesOf(plan)).toEqual({
      model_provider: 'omgvibe',
      model: 'openai/gpt-5.5',
      model_providers: {
        omgvibe: {
          name: 'OhMyGPT',
          base_url: `${ENDPOINT}/v1`,
          wire_api: 'responses',
          env_key: 'OHMYGPT_API_KEY',
          http_headers: ATTRIBUTION,
        },
      },
    });
    expect(plan.env).toEqual({ OHMYGPT_API_KEY: KEY });
    expect(plan.args.join(' ')).not.toContain(KEY);
  });

  it('turns hosted web search off for a model that has none, and leaves an unknown model alone', async () => {
    expect(overridesOf((await launch('codex', { model: entry('zhipu/glm-5.3') })).plan)).toMatchObject({ web_search: 'disabled' });
    expect(overridesOf((await launch('codex', { model: entry('openai/gpt-5.5') })).plan)).not.toHaveProperty('web_search');
    expect(overridesOf((await launch('codex', { model: { id: 'vendor/not-in-catalog' } })).plan)).not.toHaveProperty('web_search');
  });

  it('states the window only when it is smaller than the one Codex would assume', async () => {
    const small = { id: 'vendor/small', entry: { ...entry('zhipu/glm-5.3').entry, id: 'vendor/small', context: 200_000 } };
    expect(overridesOf((await launch('codex', { model: small })).plan)).toMatchObject({ model_context_window: 200_000 });
    expect(overridesOf((await launch('codex', { model: entry('zhipu/glm-5.3') })).plan)).not.toHaveProperty('model_context_window');
  });

  it('setup writes a provider that carries the key, under its own id', () => {
    const [edit] = setupEdits('codex', entry('zhipu/glm-5.3'));
    const { text } = applyOps('toml', null, edit!.ops);
    expect(parseTomlText(text)).toEqual({
      model: 'zhipu/glm-5.3',
      model_provider: 'ohmygpt',
      web_search: 'disabled',
      model_providers: {
        ohmygpt: { name: 'OhMyGPT', base_url: `${ENDPOINT}/v1`, wire_api: 'responses', http_headers: ATTRIBUTION, experimental_bearer_token: KEY },
      },
    });
  });
});

describe('opencode and kilo', () => {
  it('passes inline config that reads the key from the environment', async () => {
    const { plan } = await launch('opencode', { model: entry('zhipu/glm-5.3'), version: '1.19.5' });
    const config = JSON.parse(plan.env.OPENCODE_CONFIG_CONTENT!) as {
      model: string;
      small_model: string;
      provider: { ohmygpt: { options: Record<string, unknown>; models: Record<string, { limit: { context: number; output: number } }> } };
    };
    expect(config.model).toBe('ohmygpt/zhipu/glm-5.3');
    expect(config.small_model).toBe('ohmygpt/zhipu/glm-5.3');
    expect(config.provider.ohmygpt.options).toEqual({ baseURL: `${ENDPOINT}/v1`, apiKey: '{env:OHMYGPT_API_KEY}', headers: ATTRIBUTION });
    expect(config.provider.ohmygpt.models['zhipu/glm-5.3']!.limit).toEqual({ context: 1_048_576, output: 131_072 });
    expect(plan.env.OPENCODE_CONFIG_CONTENT).not.toContain(KEY);
    expect(plan.env.OHMYGPT_API_KEY).toBe(KEY);
    expect(plan.args).toEqual(['--user-flag', 'value']);
  });

  it('asks opencode 2 for a private server so the session config is the one it reads', async () => {
    expect((await launch('opencode', { version: 'opencode v2.3.0' })).plan.args[0]).toBe('--standalone');
    expect((await launch('opencode', { version: '2.3.0', userArgs: ['--standalone', 'run', 'x'] })).plan.args).toEqual(['--standalone', 'run', 'x']);
    expect((await launch('opencode', { version: undefined })).plan.args).not.toContain('--standalone');
    expect((await launch('kilo', { version: '7.8.27' })).plan.args).not.toContain('--standalone');
  });

  it('declares a model the catalog does not list, so it can still be selected', async () => {
    const { plan } = await launch('kilo', { model: { id: 'vendor/brand-new' }, models: [] });
    const config = JSON.parse(plan.env.KILO_CONFIG_CONTENT!) as { provider: { ohmygpt: { models: Record<string, unknown> } } };
    expect(Object.keys(config.provider.ohmygpt.models)).toEqual(['vendor/brand-new']);
  });

  it('setup targets the XDG config directory and offers the .jsonc name as an alternative', () => {
    const agent = findAgent('opencode')!;
    const [edit] = agent.setup!({
      endpoint: ENDPOINT,
      apiKey: KEY,
      model: entry('zhipu/glm-5.3'),
      models: [],
      home: '/home/test',
      env: { XDG_CONFIG_HOME: '/xdg' },
      attribution: {},
    });
    expect(edit!.path).toBe('/xdg/opencode/opencode.json');
    expect(edit!.alternatives).toEqual(['/xdg/opencode/opencode.jsonc']);
    expect(edit!.ops[0]).toMatchObject({ path: ['$schema'], ifAbsent: true });
  });
});

describe('qwen, pi and codewhale', () => {
  it('qwen gets the endpoint by flag and the key by environment', async () => {
    const { plan } = await launch('qwen', { model: entry('zhipu/glm-5.3') });
    expect(plan.args).toEqual(['--auth-type', 'openai', '--openai-base-url', `${ENDPOINT}/v1`, '--model', 'zhipu/glm-5.3', '--user-flag', 'value']);
    expect(plan.env).toMatchObject({ OPENAI_API_KEY: KEY });
    expect(plan.env).toHaveProperty('OPENAI_BASE_URL', undefined);
  });

  it('pi gets a session extension that registers the provider, with no key in the file', async () => {
    const { plan, files } = await launch('pi', { model: entry('zhipu/glm-5.3') });
    const extension = files['ohmygpt-provider.ts']!;
    expect(extension).toContain('pi.registerProvider("ohmygpt"');
    expect(extension).toContain('"apiKey": "$OHMYGPT_API_KEY"');
    expect(extension).toContain(`"baseUrl": "${ENDPOINT}/v1"`);
    expect(extension).not.toContain(KEY);
    expect(plan.args.slice(0, 6)).toEqual(['-e', '/scratch/ohmygpt-provider.ts', '--provider', 'ohmygpt', '--model', 'zhipu/glm-5.3']);
  });

  it('codewhale gets a config that names the variable holding the key', async () => {
    const { plan, files } = await launch('codewhale', { model: entry('zhipu/glm-5.3') });
    expect(parseTomlText(files['codewhale-config.toml']!)).toEqual({
      provider: 'openai',
      default_text_model: 'zhipu/glm-5.3',
      providers: { openai: { api_key_env: 'OHMYGPT_API_KEY', base_url: `${ENDPOINT}/v1`, context_window: 1_048_576 } },
    });
    expect(plan.args.slice(0, 2)).toEqual(['--config', '/scratch/codewhale-config.toml']);
    expect(files['codewhale-config.toml']).not.toContain(KEY);
  });

  it('qwen has no persistent setup; pi and codewhale do', () => {
    expect(findAgent('qwen')!.setup).toBeUndefined();
    expect(setupEdits('pi', entry('zhipu/glm-5.3')).map((edit) => edit.path)).toEqual(['/home/test/.pi/agent/models.json', '/home/test/.pi/agent/settings.json']);
    expect(setupEdits('codewhale', entry('zhipu/glm-5.3'))[0]!.path).toBe('/home/test/.codewhale/config.toml');
  });
});
