import type { AgentDefinition } from './types';

/**
 * Qwen Code takes an OpenAI-compatible endpoint from flags and the key from
 * `OPENAI_API_KEY`, so a session needs no config file at all. The key goes
 * through the environment rather than `--openai-api-key`, which would show it
 * in the process list.
 *
 * @see https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/
 */
export const qwen: AgentDefinition = {
  id: 'qwen',
  aliases: ['qwen-code'],
  name: 'Qwen Code',
  vendor: 'Alibaba',
  bin: ['qwen'],
  protocol: 'openai-completions',
  homepage: 'https://github.com/QwenLM/qwen-code',
  install: [
    {
      label: 'npm',
      command: 'npm install -g @qwen-code/qwen-code',
      run: { kind: 'exec', file: 'npm', args: ['install', '-g', '@qwen-code/qwen-code'] },
    },
    {
      label: 'Homebrew',
      platforms: ['darwin', 'linux'],
      command: 'brew install qwen-code',
      run: { kind: 'exec', file: 'brew', args: ['install', 'qwen-code'] },
    },
  ],
  modelRequired: true,
  preferredModels: ['anthropic/claude-sonnet-5-5'],

  launch(input) {
    const flags = ['--auth-type', 'openai', '--openai-base-url', `${input.endpoint}/v1`];
    if (input.model) flags.push('--model', input.model.id);
    return {
      args: [...flags, ...input.userArgs],
      env: {
        OPENAI_API_KEY: input.apiKey,
        // An ambient base URL or model would otherwise compete with the flags.
        OPENAI_BASE_URL: undefined,
        OPENAI_MODEL: undefined,
      },
    };
  },

  oneShot: (prompt) => [prompt],
};
