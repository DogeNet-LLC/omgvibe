import path from 'node:path';

import { KEY_ENV } from '../core/account';
import type { Model } from '../core/catalog';
import type { AgentDefinition, InstallMethod, LaunchInput, SetupInput } from './types';

/**
 * opencode and its fork Kilo Code take a provider as a block of JSON config
 * built on the AI SDK's OpenAI-compatible package, which calls
 * `/chat/completions` under a base URL ending in `/v1`.
 *
 * Both accept that config inline through an environment variable, merged over
 * the user's own files, which is what makes a session-scoped launch possible.
 *
 * @see https://www.ohmygpt.com/docs/code-cli/opencode
 * @see https://opencode.ai/docs/config
 * @see https://kilo.ai/docs/code-with-ai/platforms/cli
 */

const PROVIDER_ID = 'ohmygpt';

/** The output limit to state when the catalog gives none; opencode needs a number to plan compaction. */
const DEFAULT_OUTPUT_TOKENS = 32_768;

/** How many models `setup` writes into the user's config file besides the chosen one. */
const SETUP_MODEL_COUNT = 24;

interface ProviderBlock {
  npm: string;
  name: string;
  options: { baseURL: string; apiKey: string; headers?: Record<string, string> };
  models: Record<string, { name: string; limit: { context: number; output: number } }>;
}

function modelEntry(model: Model): ProviderBlock['models'][string] {
  const output = Math.min(model.maxOutput ?? DEFAULT_OUTPUT_TOKENS, model.context || DEFAULT_OUTPUT_TOKENS);
  return { name: model.name, limit: { context: model.context, output } };
}

function providerBlock(
  input: Pick<LaunchInput, 'endpoint' | 'attribution' | 'model'>,
  models: readonly Model[],
  apiKey: string,
): ProviderBlock {
  const entries: ProviderBlock['models'] = {};
  for (const model of models) entries[model.id] = modelEntry(model);
  // A model the catalog does not list still has to be declared to be selectable.
  if (input.model && !entries[input.model.id]) {
    entries[input.model.id] = input.model.entry
      ? modelEntry(input.model.entry)
      : { name: input.model.id, limit: { context: 200_000, output: DEFAULT_OUTPUT_TOKENS } };
  }
  return {
    npm: '@ai-sdk/openai-compatible',
    name: 'OhMyGPT',
    options: {
      baseURL: `${input.endpoint}/v1`,
      apiKey,
      ...(Object.keys(input.attribution).length > 0 ? { headers: { ...input.attribution } } : {}),
    },
    models: entries,
  };
}

/** `2.3.0` or `opencode v2.3.0` → 2. */
function majorVersion(version: string | undefined): number | undefined {
  const match = /(\d+)\.\d+/.exec(version ?? '');
  return match ? Number(match[1]) : undefined;
}

interface Flavor {
  id: string;
  aliases?: string[];
  name: string;
  vendor: string;
  bin: string[];
  homepage: string;
  docs?: string;
  install: InstallMethod[];
  /** Environment variable that carries inline config. */
  inlineConfigEnv: string;
  /** `$schema` written into a config file this tool creates. */
  schema: string;
  /** Directory name under the XDG config home, and the config file names to look for there. */
  configDir: string;
  configFiles: string[];
  /**
   * From this major version on, the tool runs a shared background server that
   * reads config from its own environment; a launch then needs `--standalone`
   * to get a private server that sees the session's variables.
   */
  sharedServerSince?: number;
}

function configHome(home: string, env: NodeJS.ProcessEnv): string {
  return env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
}

function openCodeLike(flavor: Flavor): AgentDefinition {
  return {
    id: flavor.id,
    aliases: flavor.aliases,
    name: flavor.name,
    vendor: flavor.vendor,
    bin: flavor.bin,
    binDirs: (home) => [path.join(home, `.${flavor.configDir}`, 'bin')],
    protocol: 'openai-completions',
    homepage: flavor.homepage,
    docs: flavor.docs,
    install: flavor.install,
    modelRequired: true,
    preferredModels: ['deepseek/deepseek-v4.1-flash-1017'],

    launch(input) {
      // The key stays out of the config text: `{env:…}` is resolved by the agent.
      const provider = providerBlock(input, input.models, `{env:${KEY_ENV}}`);
      const config: Record<string, unknown> = { provider: { [PROVIDER_ID]: provider } };
      if (input.model) {
        config.model = `${PROVIDER_ID}/${input.model.id}`;
        // Titles and other light work stay on the model the user chose.
        config.small_model = `${PROVIDER_ID}/${input.model.id}`;
      }
      const major = majorVersion(input.version);
      const standalone =
        flavor.sharedServerSince !== undefined &&
        major !== undefined &&
        major >= flavor.sharedServerSince &&
        !input.userArgs.includes('--standalone');
      return {
        args: [...(standalone ? ['--standalone'] : []), ...input.userArgs],
        env: { [flavor.inlineConfigEnv]: JSON.stringify(config), [KEY_ENV]: input.apiKey },
      };
    },

    setup(input: SetupInput) {
      const dir = path.join(configHome(input.home, input.env), flavor.configDir);
      const provider = providerBlock(input, input.models.slice(0, SETUP_MODEL_COUNT), input.apiKey);
      return [
        {
          path: path.join(dir, flavor.configFiles[0]!),
          alternatives: flavor.configFiles.slice(1).map((name) => path.join(dir, name)),
          format: 'json',
          secret: true,
          ops: [
            { kind: 'json-set', path: ['$schema'], value: flavor.schema, ifAbsent: true },
            { kind: 'json-set', path: ['provider', PROVIDER_ID], value: provider },
            ...(input.model
              ? [
                  { kind: 'json-set' as const, path: ['model'], value: `${PROVIDER_ID}/${input.model.id}` },
                  { kind: 'json-set' as const, path: ['small_model'], value: `${PROVIDER_ID}/${input.model.id}` },
                ]
              : []),
          ],
        },
      ];
    },

    oneShot: (prompt) => ['run', prompt],
  };
}

export const opencode = openCodeLike({
  id: 'opencode',
  aliases: ['oc'],
  name: 'opencode',
  vendor: 'Anomaly',
  bin: ['opencode'],
  homepage: 'https://opencode.ai',
  docs: 'https://www.ohmygpt.com/docs/code-cli/opencode',
  install: [
    {
      label: 'Official installer',
      platforms: ['darwin', 'linux'],
      command: 'curl -fsSL https://opencode.ai/install | bash',
      run: { kind: 'shell', shell: 'sh' },
    },
    {
      label: 'npm',
      command: 'npm install -g opencode-ai',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', 'opencode-ai'] },
    },
    {
      label: 'Homebrew',
      platforms: ['darwin', 'linux'],
      command: 'brew install opencode',
      run: { kind: 'exec', file: 'brew', args: ['install', 'opencode'] },
    },
  ],
  inlineConfigEnv: 'OPENCODE_CONFIG_CONTENT',
  schema: 'https://opencode.ai/config.json',
  configDir: 'opencode',
  configFiles: ['opencode.json', 'opencode.jsonc'],
  sharedServerSince: 2,
});

export const kilo = openCodeLike({
  id: 'kilo',
  aliases: ['kilocode', 'kilo-code'],
  name: 'Kilo Code',
  vendor: 'Kilo',
  bin: ['kilo', 'kilocode'],
  homepage: 'https://kilo.ai/docs/code-with-ai/platforms/cli',
  install: [
    {
      label: 'npm',
      command: 'npm install -g @kilocode/cli',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', '@kilocode/cli'] },
    },
    {
      label: 'Official installer',
      platforms: ['darwin', 'linux'],
      command: 'curl -fsSL https://kilo.ai/cli/install | bash',
      run: { kind: 'shell', shell: 'sh' },
    },
  ],
  inlineConfigEnv: 'KILO_CONFIG_CONTENT',
  schema: 'https://app.kilo.ai/config.json',
  configDir: 'kilo',
  configFiles: ['kilo.jsonc', 'kilo.json'],
});
