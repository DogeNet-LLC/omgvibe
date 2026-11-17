import path from 'node:path';

import { KEY_ENV } from '../core/account';
import type { AgentDefinition, LaunchInput, SetupInput } from './types';

/**
 * Claude Code speaks Anthropic Messages. It appends `/v1/messages` to the base
 * URL itself, so the base URL carries no `/v1`.
 *
 * @see https://www.ohmygpt.com/docs/code-cli/claude-code
 * @see https://code.claude.com/docs/en/llm-gateway
 */

/**
 * The environment that points Claude Code at OhMyGPT.
 *
 * With no model, Claude Code keeps its own defaults and aliases (`opus`,
 * `sonnet`, `haiku`): the gateway accepts the Claude model names it sends.
 * With a Claude model, only the main model is set. With any other model the
 * three aliases point at it too — Claude Code runs background work such as
 * session titles on its Haiku alias, and a key restricted to the chosen model
 * would otherwise be refused there.
 *
 * Claude Code cannot know the context window of a model that is not Claude's,
 * so it guesses one and compacts at the guess. The catalog knows the real
 * window; `CLAUDE_CODE_MAX_CONTEXT_TOKENS` hands it over, which also ends the
 * "doesn't recognize the model" warning.
 * @see https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id
 */
function gatewayEnv(input: Pick<LaunchInput, 'endpoint' | 'apiKey' | 'model' | 'attribution'>): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: input.endpoint,
    // Sent as `Authorization: Bearer`; unlike ANTHROPIC_API_KEY it needs no approval prompt.
    ANTHROPIC_AUTH_TOKEN: input.apiKey,
    // Fills the /model picker from the gateway's model list.
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
  };
  const headers = Object.entries(input.attribution).map(([name, value]) => `${name}: ${value}`);
  if (headers.length > 0) env.ANTHROPIC_CUSTOM_HEADERS = headers.join('\n');

  const model = input.model;
  if (model) {
    env.ANTHROPIC_MODEL = model.id;
    // Claude Code recognises any ID that contains a Claude model name, `anthropic/claude-…` included.
    const isClaude = /(^|\/)claude-/.test(model.id);
    if (!isClaude) {
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = model.id;
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = model.id;
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model.id;
      const window = model.entry?.context;
      if (window !== undefined && window > 0) env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(window);
    }
  }
  return env;
}

export const claude: AgentDefinition = {
  id: 'claude',
  aliases: ['claude-code', 'cc'],
  name: 'Claude Code',
  vendor: 'Anthropic',
  bin: ['claude'],
  binDirs: (home) => [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local')],
  protocol: 'anthropic-messages',
  homepage: 'https://code.claude.com/docs',
  docs: 'https://www.ohmygpt.com/docs/code-cli/claude-code',
  install: [
    {
      label: 'Official installer',
      platforms: ['darwin', 'linux'],
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
      run: { kind: 'shell', shell: 'sh' },
    },
    {
      label: 'Official installer',
      platforms: ['win32'],
      command: 'irm https://claude.ai/install.ps1 | iex',
      run: { kind: 'shell', shell: 'powershell' },
    },
    {
      label: 'npm',
      command: 'npm install -g @anthropic-ai/claude-code',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'] },
    },
  ],
  modelRequired: false,
  preferredModels: ['anthropic/claude-sonnet-5-5'],

  async launch(input) {
    const env = gatewayEnv(input);
    // A settings `env` block overrides the process environment, so values left
    // in ~/.claude/settings.json by an earlier setup would win over plain
    // environment variables. `--settings` ranks above user settings, and a file
    // sidesteps shell quoting on every platform.
    const settings = await input.scratch.file('claude-settings.json', `${JSON.stringify({ env }, null, 2)}\n`);
    return {
      args: ['--settings', settings, ...input.userArgs],
      env: {
        ...env,
        // Never forward a real Anthropic key to another host as x-api-key.
        ANTHROPIC_API_KEY: undefined,
        [KEY_ENV]: input.apiKey,
      },
    };
  },

  setup(input: SetupInput) {
    const env = gatewayEnv(input);
    return [
      {
        path: path.join(input.home, '.claude', 'settings.json'),
        format: 'json',
        secret: true,
        ops: Object.entries(env).map(([name, value]) => ({
          kind: 'json-set' as const,
          path: ['env', name],
          value,
        })),
      },
    ];
  },

  oneShot: (prompt) => ['-p', prompt, '--max-turns', '1'],
};
