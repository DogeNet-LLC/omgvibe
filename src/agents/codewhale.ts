import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { KEY_ENV } from '../core/account';
import { applyOps, type EditOp } from '../core/edits';
import type { TomlValue } from '../core/toml-edit';
import type { AgentDefinition, LaunchInput, SetupInput } from './types';

/**
 * CodeWhale reaches an OpenAI-compatible gateway through its built-in
 * `openai` provider. By design it does not send a key from the ambient
 * environment to a custom host, so a session cannot be configured with
 * environment variables alone: it gets a copy of the user's config with the
 * provider pointed at OhMyGPT, passed with `--config`. The copy names the
 * variable to read the key from, so it holds no secret.
 *
 * @see https://github.com/codewhale-hq/CodeWhale/blob/main/docs/CONFIGURATION.md
 */

const configPath = (home: string, env: NodeJS.ProcessEnv): string =>
  env.CODEWHALE_CONFIG_PATH?.trim() || path.join(env.CODEWHALE_HOME?.trim() || path.join(home, '.codewhale'), 'config.toml');

function ops(input: Pick<LaunchInput, 'endpoint' | 'model'>, key: Record<string, TomlValue>): EditOp[] {
  const provider: Record<string, TomlValue> = { ...key, base_url: `${input.endpoint}/v1` };
  // CodeWhale has no per-model window setting; the provider's is the one knob.
  const window = input.model?.entry?.context;
  if (window !== undefined && window > 0) provider.context_window = window;
  return [
    { kind: 'toml-set', key: 'provider', value: 'openai' },
    ...(input.model ? [{ kind: 'toml-set' as const, key: 'default_text_model', value: input.model.id }] : []),
    { kind: 'toml-table', table: ['providers', 'openai'], entries: provider },
  ];
}

export const codewhale: AgentDefinition = {
  id: 'codewhale',
  aliases: ['cw'],
  name: 'CodeWhale',
  vendor: 'CodeWhale',
  bin: ['codewhale'],
  protocol: 'openai-completions',
  homepage: 'https://github.com/codewhale-hq/CodeWhale',
  install: [
    {
      label: 'npm',
      command: 'npm install -g codewhale',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', 'codewhale'] },
    },
  ],
  modelRequired: true,
  preferredModels: ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-sonnet-5-5'],

  async launch(input) {
    const userConfig = configPath(input.home, input.env);
    let base: string | null = null;
    try {
      if (existsSync(userConfig)) base = readFileSync(userConfig, 'utf8');
    } catch {
      base = null;
    }
    let text: string;
    try {
      text = applyOps('toml', base, ops(input, { api_key_env: KEY_ENV })).text;
    } catch {
      // A config this cannot be layered onto still must not block the session: start from a clean one.
      text = applyOps('toml', null, ops(input, { api_key_env: KEY_ENV })).text;
    }
    const file = await input.scratch.file('codewhale-config.toml', text);
    return { args: ['--config', file, ...input.userArgs], env: { [KEY_ENV]: input.apiKey } };
  },

  setup(input: SetupInput) {
    return [
      {
        path: configPath(input.home, input.env),
        format: 'toml',
        secret: true,
        ops: ops(input, { api_key: input.apiKey }),
      },
    ];
  },

  oneShot: (prompt) => ['exec', prompt],
};
