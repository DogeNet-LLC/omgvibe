import path from 'node:path';

import { KEY_ENV } from '../core/account';
import type { Model } from '../core/catalog';
import type { AgentDefinition, LaunchInput, SetupInput } from './types';

/**
 * Pi has no flag for a base URL: a provider has to be registered, either in
 * `~/.pi/agent/models.json` or by an extension. A session passes a small
 * extension file with `-e`, which registers the provider for that process
 * only; `setup` writes the same provider into `models.json`.
 *
 * @see https://pi.dev/docs/custom-provider
 * @see https://pi.dev/docs/models-configuration
 */

const PROVIDER_ID = 'ohmygpt';

/** How many models `setup` writes into `models.json` besides the chosen one. */
const SETUP_MODEL_COUNT = 24;

interface PiModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

function piModel(model: Model): PiModel {
  return {
    id: model.id,
    name: model.name,
    // The catalog does not say which models reason; Pi then sends no reasoning options.
    reasoning: false,
    input: model.inputModalities.includes('image') ? ['text', 'image'] : ['text'],
    // USD per million tokens, the unit Pi shows session cost in.
    cost: { input: model.inputPrice ?? 0, output: model.outputPrice ?? 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.context,
    maxTokens: Math.min(model.maxOutput ?? 32_768, model.context || 32_768),
  };
}

function providerConfig(input: Pick<LaunchInput, 'endpoint' | 'attribution' | 'model'>, models: readonly Model[], apiKey: string) {
  const listed = models.map(piModel);
  if (input.model && !listed.some((model) => model.id === input.model!.id)) {
    listed.unshift(
      input.model.entry
        ? piModel(input.model.entry)
        : {
            id: input.model.id,
            name: input.model.id,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200_000,
            maxTokens: 32_768,
          },
    );
  }
  return {
    name: 'OhMyGPT',
    baseUrl: `${input.endpoint}/v1`,
    api: 'openai-completions',
    apiKey,
    ...(Object.keys(input.attribution).length > 0 ? { headers: { ...input.attribution } } : {}),
    models: listed,
  };
}

export const pi: AgentDefinition = {
  id: 'pi',
  name: 'Pi',
  vendor: 'Earendil Works',
  bin: ['pi'],
  protocol: 'openai-completions',
  homepage: 'https://pi.dev',
  install: [
    {
      label: 'npm',
      command: 'npm install -g @earendil-works/pi-coding-agent',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', '@earendil-works/pi-coding-agent'] },
    },
    {
      label: 'Official installer',
      platforms: ['darwin', 'linux'],
      command: 'curl -fsSL https://pi.dev/install.sh | sh',
      run: { kind: 'shell', shell: 'sh' },
    },
  ],
  modelRequired: true,
  preferredModels: ['anthropic/claude-sonnet-5-5'],

  async launch(input) {
    // `$NAME` in a provider's apiKey is read from the environment by Pi, so the file holds no secret.
    const provider = providerConfig(input, input.models, `$${KEY_ENV}`);
    const extension = [
      '// Written by omgvibe for this session; removed when Pi exits.',
      'export default function (pi) {',
      `  pi.registerProvider(${JSON.stringify(PROVIDER_ID)}, ${JSON.stringify(provider, null, 2).replace(/\n/g, '\n  ')});`,
      '}',
      '',
    ].join('\n');
    const file = await input.scratch.file('ohmygpt-provider.ts', extension);
    const flags = ['-e', file];
    // A bare `anthropic/…` ID would resolve to Pi's built-in provider of that name; naming ours prevents it.
    if (input.model) flags.push('--provider', PROVIDER_ID, '--model', input.model.id);
    return { args: [...flags, ...input.userArgs], env: { [KEY_ENV]: input.apiKey } };
  },

  setup(input: SetupInput) {
    const dir = path.join(input.home, '.pi', 'agent');
    const provider = providerConfig(input, input.models.slice(0, SETUP_MODEL_COUNT), input.apiKey);
    return [
      {
        path: path.join(dir, 'models.json'),
        format: 'json',
        secret: true,
        ops: [{ kind: 'json-set', path: ['providers', PROVIDER_ID], value: provider }],
      },
      ...(input.model
        ? [
            {
              path: path.join(dir, 'settings.json'),
              format: 'json' as const,
              ops: [
                { kind: 'json-set' as const, path: ['defaultProvider'], value: PROVIDER_ID },
                { kind: 'json-set' as const, path: ['defaultModel'], value: input.model.id },
              ],
            },
          ]
        : []),
    ];
  },

  oneShot: (prompt) => ['-p', prompt, '--no-session'],
};
