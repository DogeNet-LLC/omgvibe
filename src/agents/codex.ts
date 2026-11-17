import path from 'node:path';

import { KEY_ENV } from '../core/account';
import { renderValue, type TomlValue } from '../core/toml-edit';
import type { AgentDefinition, LaunchInput } from './types';

/**
 * Codex CLI speaks OpenAI Responses and appends `/responses` to the base URL,
 * so the base URL ends in `/v1`.
 *
 * @see https://www.ohmygpt.com/docs/code-cli/codex
 * @see https://developers.openai.com/codex/config-reference
 */

/**
 * Provider ids. A session launch uses its own id so that nothing in a
 * `[model_providers.ohmygpt]` table left by `setup` (an older key, say) is
 * merged into the session's provider.
 */
const SESSION_PROVIDER = 'omgvibe';
const SETUP_PROVIDER = 'ohmygpt';

/** The window Codex assumes for a model it has no metadata for. */
const CODEX_FALLBACK_WINDOW = 272_000;

function providerEntries(endpoint: string, attribution: Record<string, string>): Record<string, TomlValue> {
  const entries: Record<string, TomlValue> = {
    name: 'OhMyGPT',
    base_url: `${endpoint}/v1`,
    wire_api: 'responses',
  };
  if (Object.keys(attribution).length > 0) entries.http_headers = { ...attribution };
  return entries;
}

/**
 * Codex knows OpenAI's own models (it matches `openai/gpt-5.5` to its built-in
 * `gpt-5.5` metadata). For anything else it assumes a fixed window, which
 * overruns a smaller model before compaction starts — so the real window is
 * passed along for those.
 */
function smallerWindow(model: LaunchInput['model']): number | undefined {
  const window = model?.entry?.context;
  if (!model || model.id.startsWith('openai/') || window === undefined) return undefined;
  return window > 0 && window < CODEX_FALLBACK_WINDOW ? window : undefined;
}

/**
 * Codex declares the hosted web search tool on every request by default, and
 * the gateway rejects that for a model that has no web search. Only a model
 * the catalog describes can be judged; an unknown one is left as Codex has it.
 */
const lacksWebSearch = (model: LaunchInput['model']): boolean => model?.entry !== undefined && !model.entry.webSearch;

export const codex: AgentDefinition = {
  id: 'codex',
  name: 'Codex',
  vendor: 'OpenAI',
  bin: ['codex'],
  protocol: 'openai-responses',
  homepage: 'https://developers.openai.com/codex',
  docs: 'https://www.ohmygpt.com/docs/code-cli/codex',
  install: [
    {
      label: 'npm',
      command: 'npm install -g @openai/codex',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', '@openai/codex'] },
    },
    {
      label: 'Homebrew',
      platforms: ['darwin', 'linux'],
      command: 'brew install --cask codex',
      run: { kind: 'exec', file: 'brew', args: ['install', '--cask', 'codex'] },
    },
  ],
  // Codex's own default model names are not catalog IDs, so one is always passed.
  modelRequired: true,
  preferredModels: ['openai/gpt-5.5'],

  launch(input) {
    const overrides: Array<[string, TomlValue]> = [['model_provider', SESSION_PROVIDER]];
    const provider = { ...providerEntries(input.endpoint, input.attribution), env_key: KEY_ENV };
    for (const [key, value] of Object.entries(provider)) {
      overrides.push([`model_providers.${SESSION_PROVIDER}.${key}`, value]);
    }
    if (input.model) overrides.push(['model', input.model.id]);
    const window = smallerWindow(input.model);
    if (window !== undefined) overrides.push(['model_context_window', window]);
    if (lacksWebSearch(input.model)) overrides.push(['web_search', 'disabled']);

    // `-c key=value` overrides sit before the user's arguments, where Codex
    // applies them to every subcommand (`exec`, `resume`, …). The value is TOML.
    return {
      args: [...overrides.flatMap(([key, value]) => ['-c', `${key}=${renderValue(value)}`]), ...input.userArgs],
      env: { [KEY_ENV]: input.apiKey },
    };
  },

  setup(input) {
    const file = path.join(input.home, '.codex', 'config.toml');
    return [
      {
        path: file,
        format: 'toml',
        secret: true,
        ops: [
          ...(input.model ? [{ kind: 'toml-set' as const, key: 'model', value: input.model.id }] : []),
          { kind: 'toml-set', key: 'model_provider', value: SETUP_PROVIDER },
          ...(lacksWebSearch(input.model) ? [{ kind: 'toml-set' as const, key: 'web_search', value: 'disabled' }] : []),
          {
            kind: 'toml-table',
            table: ['model_providers', SETUP_PROVIDER],
            entries: {
              ...providerEntries(input.endpoint, input.attribution),
              // Stored in the file so Codex works from any shell, the IDE
              // extension and the desktop app, with no variable to export.
              experimental_bearer_token: input.apiKey,
            },
          },
        ],
      },
    ];
  },

  oneShot: (prompt) => ['exec', '--skip-git-repo-check', prompt],
};
