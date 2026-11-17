import type { AgentDefinition } from '../agents/types';
import { t } from '../i18n';
import { cleanKey, KEY_ENV } from './account';
import {
  agentModels,
  type LoadedCatalog,
  loadCatalog,
  matchModel,
  type Model,
  pickDefaultModel,
} from './catalog';
import {
  DEFAULT_ENDPOINT,
  type Endpoint,
  ENDPOINTS,
  fastest,
  probeAll,
  type ProbeResult,
  resolveEndpoint,
} from './endpoints';
import { type Config, updateConfig } from './store';
import { CliError, note } from './ui';

/** Options omgvibe itself understands; everything else on the command line belongs to a command or an agent. */
export interface Options {
  model?: string;
  pick: boolean;
  endpoint?: string;
  key?: string;
  yes: boolean;
  json: boolean;
  install: boolean;
  browser: boolean;
  refresh: boolean;
  all: boolean;
}

export const BASE_URL_ENV = 'OHMYGPT_BASE_URL';

/** Sent with each request to name the agent that made it. */
export const ATTRIBUTION_URL = 'https://github.com/DogeNet-LLC/omgvibe';

export function attributionFor(agent: AgentDefinition): Record<string, string> {
  return {
    'HTTP-Referer': ATTRIBUTION_URL,
    'X-OhMyGPT-Title': agent.name,
    'X-OhMyGPT-Categories': 'cli-agent',
  };
}

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

export type KeySource = 'flag' | 'env' | 'saved';

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

/** `--key`, then `OHMYGPT_API_KEY`, then the key saved by `omgvibe login`. */
export function resolveKey(options: Options, config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedKey | null {
  const candidates: Array<[string | undefined, KeySource]> = [
    [options.key, 'flag'],
    [env[KEY_ENV], 'env'],
    [config.apiKey, 'saved'],
  ];
  for (const [value, source] of candidates) {
    const key = value ? cleanKey(value) : '';
    if (key) return { key, source };
  }
  return null;
}

export function requireKey(options: Options, config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedKey {
  const resolved = resolveKey(options, config, env);
  if (!resolved) throw new CliError(t().errNotSignedIn, [t().errNotSignedInHint]);
  return resolved;
}

// ---------------------------------------------------------------------------
// endpoint
// ---------------------------------------------------------------------------

/** An automatically chosen endpoint is measured again after this long. */
const REPROBE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type EndpointSource = 'flag' | 'env' | 'pinned' | 'auto' | 'default';

export interface ResolvedEndpoint {
  endpoint: Endpoint;
  source: EndpointSource;
}

function parseEndpoint(value: string): Endpoint {
  try {
    return resolveEndpoint(value);
  } catch {
    throw new CliError(t().errBadEndpoint(value));
  }
}

/** Measures every endpoint and remembers the fastest as the automatic choice. */
export async function measureAndSave(env: NodeJS.ProcessEnv = process.env): Promise<{ results: ProbeResult[]; best: ProbeResult | null }> {
  const results = await probeAll(ENDPOINTS, { env });
  const best = fastest(results);
  if (best) {
    await updateConfig((config) => {
      config.endpoint = best.endpoint.url;
      config.endpointPinned = false;
      config.endpointProbedAt = Date.now();
    }, env);
  }
  return { results, best };
}

/**
 * The endpoint to use: `--endpoint`, then `OHMYGPT_BASE_URL`, then the saved
 * choice. With nothing saved the endpoints are measured once and the fastest
 * is kept; an automatic choice is refreshed when it has gone stale. A choice
 * the user pinned is never second-guessed.
 */
export async function resolveEndpointFor(
  options: Options,
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedEndpoint> {
  if (options.endpoint) return { endpoint: parseEndpoint(options.endpoint), source: 'flag' };
  const fromEnv = env[BASE_URL_ENV]?.trim();
  if (fromEnv) return { endpoint: parseEndpoint(fromEnv), source: 'env' };

  if (config.endpoint) {
    const saved = parseEndpoint(config.endpoint);
    if (config.endpointPinned) return { endpoint: saved, source: 'pinned' };
    const stale = Date.now() - (config.endpointProbedAt ?? 0) > REPROBE_AFTER_MS;
    if (!stale) return { endpoint: saved, source: 'auto' };
  }

  const { best } = await measureAndSave(env);
  if (best) return { endpoint: best.endpoint, source: 'auto' };
  // Nothing answered. Keep going with what we have: the agent may still get through (its own proxy settings, say).
  return config.endpoint
    ? { endpoint: parseEndpoint(config.endpoint), source: 'auto' }
    : { endpoint: DEFAULT_ENDPOINT, source: 'default' };
}

// ---------------------------------------------------------------------------
// catalog + model
// ---------------------------------------------------------------------------

/** The catalog, or `null` when it cannot be had (offline with no cached copy). Never throws. */
export async function tryLoadCatalog(
  endpoint: string,
  env: NodeJS.ProcessEnv = process.env,
  refresh = false,
): Promise<LoadedCatalog | null> {
  try {
    return await loadCatalog({ endpoint, env, refresh });
  } catch {
    return null;
  }
}

export interface ChosenModel {
  id: string;
  entry?: Model;
}

/**
 * Resolves the model named with `--model`: corrects a near miss, refuses a
 * model the agent's protocol cannot reach, warns about one being retired, and
 * passes an ID the catalog does not know through unchanged.
 */
export function resolveNamedModel(agent: AgentDefinition, input: string, catalog: LoadedCatalog | null): ChosenModel {
  if (!catalog) return { id: input.trim() };
  const match = matchModel(catalog.models, input);
  if (!match.model) {
    note.warn(t().modelUnknown(input.trim()));
    if (match.suggestions.length > 0) note.info(t().modelSuggest(match.suggestions.join(', ')));
    return { id: input.trim() };
  }
  const model = match.model;
  if (match.corrected) note.info(t().modelCorrected(input.trim(), model.id));
  if (model.protocols.length > 0 && !model.protocols.includes(agent.protocol)) {
    throw new CliError(t().modelWrongProtocol(model.id, agent.name, t().protocolName[agent.protocol]));
  }
  if (model.retiring) {
    note.warn(model.retiring.sunsetAt ? t().modelRetiring(model.id, model.retiring.sunsetAt) : t().modelRetiringSoon(model.id));
    if (model.retiring.successor) note.info(t().modelSuccessor(model.retiring.successor));
  }
  return { id: model.id, entry: model };
}

/**
 * The model for a launch when the user named none: the one remembered for
 * this agent if it is still offered, otherwise nothing for an agent that
 * picks its own, otherwise the catalog's default for the agent's protocol.
 */
export function resolveDefaultModel(
  agent: AgentDefinition,
  config: Config,
  catalog: LoadedCatalog | null,
): ChosenModel | undefined {
  const remembered = config.models?.[agent.id];
  if (remembered) {
    if (!catalog) return { id: remembered };
    const entry = agentModels(catalog.models, agent.protocol).find((model) => model.id === remembered);
    if (entry) return { id: entry.id, entry };
  }
  if (!agent.modelRequired) return undefined;
  if (!catalog) return agent.preferredModels[0] ? { id: agent.preferredModels[0] } : undefined;
  const entry = pickDefaultModel(catalog.models, agent.protocol, agent.preferredModels);
  return entry ? { id: entry.id, entry } : undefined;
}

/** `3 h`, `2 d`: how long ago `timestamp` was, in the active language. */
export function formatAge(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - timestamp) / 60_000));
  if (minutes < 60) return t().ago.minutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t().ago.hours(hours);
  return t().ago.days(Math.round(hours / 24));
}

/** The label shown for an endpoint: its region name, or the host for a custom URL. */
export function endpointLabel(endpoint: Endpoint): string {
  if (endpoint.id !== 'custom') return t().region[endpoint.id];
  try {
    return new URL(endpoint.url).host;
  } catch {
    return endpoint.url;
  }
}
