import fs from 'node:fs/promises';

import { readText, writeJsonAtomic } from './fsx';
import { paths } from './paths';

export type Lang = 'en' | 'zh' | 'ja';

export interface Config {
  /** OhMyGPT API key saved by `omgvibe login`. */
  apiKey?: string;
  /** Base URL of the chosen endpoint, without `/v1`. */
  endpoint?: string;
  /** True when the user picked the endpoint by hand; auto-selection then leaves it alone. */
  endpointPinned?: boolean;
  /** When the endpoint was last measured (epoch ms). */
  endpointProbedAt?: number;
  lang?: Lang;
  /** Model last used per agent id; the default for the next launch of that agent. */
  models?: Record<string, string>;
  /** Most recently used model IDs, newest first. */
  recentModels?: string[];
  /** Update check bookkeeping. */
  updateCheckedAt?: number;
  latestVersion?: string;
}

const RECENT_MODELS = 8;

/**
 * Reads `config.json`. A missing file is an empty config; a corrupt one is
 * reported, because silently starting over would look like a lost login.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const file = paths(env).config;
  const text = await readText(file);
  if (text === null || text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON. Fix or delete it, then run \`omgvibe login\` again.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object. Fix or delete it, then run \`omgvibe login\` again.`);
  }
  return parsed as Config;
}

/** The file holds the API key, so it is owner-only (0600) inside an owner-only directory. */
export async function saveConfig(config: Config, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { home, config: file } = paths(env);
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await writeJsonAtomic(file, config, { mode: 0o600, forceMode: true });
}

export async function updateConfig(
  change: (config: Config) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Config> {
  const config = await loadConfig(env);
  change(config);
  await saveConfig(config, env);
  return config;
}

/** Remembers a model as the next default for `agentId` and moves it to the front of the recents. */
export function rememberModel(config: Config, agentId: string, modelId: string): void {
  config.models = { ...config.models, [agentId]: modelId };
  config.recentModels = [modelId, ...(config.recentModels ?? []).filter((id) => id !== modelId)].slice(
    0,
    RECENT_MODELS,
  );
}
