import { readJson, writeJsonAtomic } from './fsx';
import { HttpError, httpRequest, parseJson } from './http';
import { paths } from './paths';

/**
 * The live model catalog (`GET /v1/models`, no key needed). Model IDs change
 * every week, so nothing here hard-codes a list: defaults, pickers and
 * validation all read the catalog the gateway is serving right now.
 */

/** The wire protocols an agent can speak; each model lists the ones it accepts. */
export type Protocol = 'anthropic-messages' | 'openai-responses' | 'openai-completions';

/** Free model that answers every endpoint deterministically; used to verify a setup at no cost. */
export const MOCK_MODEL = 'ohmygpt/mock';

/** 1 USD = 250,000 Credits; catalog prices are Credits per million tokens. */
const CREDITS_PER_USD = 250_000;

export interface Model {
  id: string;
  name: string;
  /** The company that made the model: the part of the ID before the slash. */
  creator: string;
  service: string;
  available: boolean;
  /** Context window in tokens. */
  context: number;
  /** Largest completion the model can produce, when the catalog states one. */
  maxOutput?: number;
  inputModalities: string[];
  outputModalities: string[];
  protocols: string[];
  /** Benchmark-based capability score; higher is stronger. */
  score?: number;
  /** Arena-style preference rating. */
  rating?: number;
  /** Release date, epoch seconds. */
  created?: number;
  /** USD per million tokens at the base tier. */
  inputPrice?: number;
  outputPrice?: number;
  /**
   * Whether the gateway offers its web search tool for this model. A request
   * that declares the tool for a model without it is rejected outright, so an
   * agent that sends it by default has to be told not to.
   */
  webSearch: boolean;
  /** Set once a model is scheduled for retirement. */
  retiring?: { sunsetAt?: string; successor?: string };
}

export interface Catalog {
  /** Shape of the cached entries; a copy written by a build with another shape is not reused. */
  schema: number;
  models: Model[];
  fetchedAt: number;
  /** Base URL the list came from. */
  endpoint: string;
}

/** Bump when a field is added to or changes meaning in {@link Model}. */
const CATALOG_SCHEMA = 2;

// ---------------------------------------------------------------------------
// wire format → Model
// ---------------------------------------------------------------------------

interface RawPriceItem {
  kind: string;
  price_credits: number;
  condition?: {
    service_tier?: string;
    usage_kind?: string;
    params?: unknown;
    valid_from?: string;
    valid_until?: string;
  };
}

interface RawPricing {
  mode?: string;
  flat?: RawPriceItem[];
  rules?: RawPriceItem[];
  tiered?: Array<{ items?: RawPriceItem[] }>;
  variants?: Array<{ items?: RawPriceItem[] }>;
}

interface RawModel {
  id: string;
  name?: string;
  service?: string;
  available?: boolean;
  context_length?: number;
  limits?: { max_completion_tokens?: number };
  modalities?: { input?: string[]; output?: string[] };
  protocols?: Array<{ id?: string }>;
  capability?: { score?: number };
  preference?: { rating?: number };
  created?: number;
  pricing?: RawPricing;
  lifecycle?: { status?: string; sunset_at?: string; successor?: string };
}

/** The items that price the model's ordinary use: first tier, default variant, default service tier. */
function baseItems(pricing: RawPricing, now: number): RawPriceItem[] {
  if (pricing.mode === 'rules') {
    return (pricing.rules ?? []).filter((rule) => {
      const condition = rule.condition;
      if (!condition) return true;
      if (condition.service_tier && condition.service_tier !== 'default') return false;
      if (condition.usage_kind || condition.params) return false;
      if (condition.valid_from && Date.parse(condition.valid_from) > now) return false;
      if (condition.valid_until && Date.parse(condition.valid_until) < now) return false;
      return true;
    });
  }
  if (pricing.mode === 'tiered') return pricing.tiered?.[0]?.items ?? [];
  if (pricing.mode === 'variant') return pricing.variants?.[0]?.items ?? [];
  return pricing.flat ?? [];
}

/** Lowest base price for `kind`, in USD per million tokens. */
function basePrice(pricing: RawPricing | undefined, kind: string, now: number): number | undefined {
  if (!pricing) return undefined;
  const prices = baseItems(pricing, now)
    .filter((item) => item.kind === kind && Number.isFinite(item.price_credits))
    .map((item) => item.price_credits);
  return prices.length > 0 ? Math.min(...prices) / CREDITS_PER_USD : undefined;
}

/** Every price item of a model, across all tiers, variants and rules. */
function allItems(pricing: RawPricing | undefined): RawPriceItem[] {
  if (!pricing) return [];
  return [
    ...(pricing.flat ?? []),
    ...(pricing.rules ?? []),
    ...(pricing.tiered ?? []).flatMap((tier) => tier.items ?? []),
    ...(pricing.variants ?? []).flatMap((variant) => variant.items ?? []),
  ];
}

export function toModel(raw: RawModel, now: number = Date.now()): Model {
  const lifecycle = raw.lifecycle;
  const retiring =
    lifecycle && (lifecycle.sunset_at || lifecycle.status === 'deprecated' || lifecycle.status === 'sunset')
      ? { sunsetAt: lifecycle.sunset_at, successor: lifecycle.successor }
      : undefined;
  return {
    id: raw.id,
    name: raw.name || raw.id,
    creator: raw.id.includes('/') ? raw.id.slice(0, raw.id.indexOf('/')) : '',
    service: raw.service ?? 'llm',
    available: raw.available !== false,
    context: raw.context_length ?? 0,
    maxOutput: raw.limits?.max_completion_tokens,
    inputModalities: raw.modalities?.input ?? [],
    outputModalities: raw.modalities?.output ?? [],
    protocols: (raw.protocols ?? []).flatMap((protocol) => (protocol.id ? [protocol.id] : [])),
    score: raw.capability?.score,
    rating: raw.preference?.rating,
    created: raw.created,
    inputPrice: basePrice(raw.pricing, 'text.input', now),
    outputPrice: basePrice(raw.pricing, 'text.output', now),
    // The catalog has no capability flag for it; a price for the tool is how a model shows it has one.
    webSearch: allItems(raw.pricing).some((item) => item.kind === 'web_search'),
    retiring,
  };
}

// ---------------------------------------------------------------------------
// fetch + cache
// ---------------------------------------------------------------------------

/** How long a cached catalog is used without asking the gateway again. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchCatalog(endpoint: string, env: NodeJS.ProcessEnv = process.env): Promise<Catalog> {
  const response = await httpRequest(`${endpoint}/v1/models`, { timeoutMs: 20_000, env });
  const payload = parseJson<{ data?: RawModel[] }>(response);
  if (response.status !== 200 || !Array.isArray(payload?.data)) {
    throw new HttpError(`${endpoint}/v1/models answered HTTP ${response.status}.`, 'network');
  }
  const now = Date.now();
  const models = payload.data.filter((raw) => typeof raw?.id === 'string').map((raw) => toModel(raw, now));
  return { schema: CATALOG_SCHEMA, models, fetchedAt: now, endpoint };
}

export interface LoadCatalogOptions {
  endpoint: string;
  env?: NodeJS.ProcessEnv;
  /** Ignore the cache and ask the gateway. */
  refresh?: boolean;
  /** Accept a cached copy up to this old. Defaults to {@link CATALOG_TTL_MS}. */
  maxAgeMs?: number;
}

export interface LoadedCatalog extends Catalog {
  /** True when the gateway could not be reached and an older cached copy was used. */
  stale: boolean;
}

/**
 * The catalog, from cache while it is fresh, otherwise from the gateway. When
 * the gateway cannot be reached an older cached copy is returned and marked
 * stale; with no copy at all the network error propagates.
 */
export async function loadCatalog(options: LoadCatalogOptions): Promise<LoadedCatalog> {
  const env = options.env ?? process.env;
  const file = paths(env).catalogCache;
  const maxAge = options.maxAgeMs ?? CATALOG_TTL_MS;

  let cached: Catalog | null = null;
  try {
    const stored = await readJson<Catalog>(file);
    if (stored?.schema === CATALOG_SCHEMA && Array.isArray(stored.models) && typeof stored.fetchedAt === 'number') {
      cached = stored;
    }
  } catch {
    cached = null; // an unreadable cache is just a cache miss
  }

  if (cached && !options.refresh && Date.now() - cached.fetchedAt < maxAge) return { ...cached, stale: false };

  try {
    const fresh = await fetchCatalog(options.endpoint, env);
    await writeJsonAtomic(file, fresh).catch(() => undefined);
    return { ...fresh, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

/** Smallest context window worth offering to a coding agent. */
const MIN_AGENT_CONTEXT = 64_000;

/**
 * Whether a model belongs in an agent's model picker: a text model the agent's
 * protocol can reach, callable now, not on its way out, with room to work in.
 * Anything else can still be requested by exact ID.
 */
export function isAgentModel(model: Model, protocol: Protocol): boolean {
  return (
    model.service === 'llm' &&
    model.available &&
    model.id !== MOCK_MODEL &&
    !model.retiring &&
    model.protocols.includes(protocol) &&
    model.context >= MIN_AGENT_CONTEXT &&
    model.outputModalities.length === 1 &&
    model.outputModalities[0] === 'text'
  );
}

/** Strongest first: capability score, then preference rating, then newest. */
export function byStrength(a: Model, b: Model): number {
  if ((a.score !== undefined) !== (b.score !== undefined)) return a.score !== undefined ? -1 : 1;
  if (a.score !== undefined && b.score !== undefined && a.score !== b.score) return b.score - a.score;
  if ((a.rating !== undefined) !== (b.rating !== undefined)) return a.rating !== undefined ? -1 : 1;
  if (a.rating !== undefined && b.rating !== undefined && a.rating !== b.rating) return b.rating - a.rating;
  if ((a.created ?? 0) !== (b.created ?? 0)) return (b.created ?? 0) - (a.created ?? 0);
  return a.id.localeCompare(b.id);
}

export function agentModels(models: readonly Model[], protocol: Protocol): Model[] {
  return models.filter((model) => isAgentModel(model, protocol)).sort(byStrength);
}

const byId = (models: readonly Model[], id: string): Model | undefined => models.find((model) => model.id === id);

/** Follows `successor` links from a retiring model to the one that replaces it. */
function followSuccessors(models: readonly Model[], start: Model): Model {
  let current = start;
  for (let hops = 0; hops < 5 && current.retiring?.successor; hops += 1) {
    const next = byId(models, current.retiring.successor);
    if (!next) break;
    current = next;
  }
  return current;
}

/**
 * The model to use when the user did not name one: the first preferred ID the
 * catalog still offers (following successors of retired ones), otherwise the
 * strongest model from the same creator, otherwise the strongest overall.
 */
export function pickDefaultModel(
  models: readonly Model[],
  protocol: Protocol,
  preferred: readonly string[],
): Model | undefined {
  const candidates = agentModels(models, protocol);
  for (const id of preferred) {
    const listed = byId(models, id);
    if (!listed) continue;
    const current = followSuccessors(models, listed);
    if (isAgentModel(current, protocol)) return current;
  }
  for (const id of preferred) {
    const creator = id.slice(0, id.indexOf('/'));
    const sameCreator = candidates.find((model) => model.creator === creator);
    if (sameCreator) return sameCreator;
  }
  return candidates[0];
}

/** Edit distance in which swapping two neighbouring letters counts once (the commonest typo). */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

export interface ModelMatch {
  /** The catalog entry the input resolved to. */
  model?: Model;
  /** True when the input was not an exact ID and was corrected to `model.id`. */
  corrected: boolean;
  /** Closest IDs, offered when nothing matched. */
  suggestions: string[];
}

/**
 * Resolves what the user typed after `--model`. An exact ID wins; otherwise a
 * unique case-insensitive match, a bare model name without its creator
 * (`claude-sonnet-5-5`), or a single mistyped name is corrected. A version
 * that does not exist is never swapped for one that does. Ambiguous or
 * unknown input resolves to nothing and comes back with suggestions.
 */
export function matchModel(models: readonly Model[], input: string): ModelMatch {
  const query = input.trim();
  const exact = byId(models, query);
  if (exact) return { model: exact, corrected: false, suggestions: [] };

  const lower = query.toLowerCase();
  const unique = (matches: Model[]): Model | undefined => (matches.length === 1 ? matches[0] : undefined);
  const corrected =
    unique(models.filter((model) => model.id.toLowerCase() === lower)) ??
    unique(models.filter((model) => model.id.toLowerCase().endsWith(`/${lower}`)));
  if (corrected) return { model: corrected, corrected: true, suggestions: [] };

  const ranked = models
    .map((model) => {
      const id = model.id.toLowerCase();
      const bare = id.slice(id.indexOf('/') + 1);
      return { model, distance: Math.min(editDistance(lower, id), editDistance(lower, bare)) };
    })
    .sort((a, b) => a.distance - b.distance || byStrength(a.model, b.model));

  // One typo's worth of distance, clearly closer than the runner-up, and the
  // same digits: a mistyped letter is corrected, a different version never is.
  const digits = (text: string): string => text.replace(/\D/g, '');
  const [best, second] = ranked;
  const tolerance = Math.max(1, Math.floor(lower.length / 8));
  if (
    best &&
    best.distance <= tolerance &&
    (!second || second.distance > best.distance) &&
    digits(best.model.id) === digits(lower)
  ) {
    return { model: best.model, corrected: true, suggestions: [] };
  }

  // Suggest what contains the input when anything does, otherwise whatever is nearest.
  const contains = models.filter((model) => model.id.toLowerCase().includes(lower)).sort(byStrength);
  const pool = contains.length > 0 ? contains : ranked.map((entry) => entry.model);
  return { corrected: false, suggestions: pool.slice(0, 5).map((model) => model.id) };
}

// ---------------------------------------------------------------------------
// display helpers
// ---------------------------------------------------------------------------

/** 1000000 → `1M`, 1050000 → `1.1M`, 262144 → `262K`. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens);
}

/** USD per million tokens, trimmed: `$2.2`, `$0.11`, `$11`. */
export function formatPrice(usd: number): string {
  if (usd === 0) return '$0';
  const digits = usd >= 100 ? 0 : usd >= 1 ? 2 : usd >= 0.1 ? 3 : 4;
  return `$${Number(usd.toFixed(digits))}`;
}

/** `$2.2 / $11` (input / output per million tokens), or an empty string when unpriced. */
export function formatModelPrice(model: Model): string {
  if (model.inputPrice === undefined || model.outputPrice === undefined) return '';
  return `${formatPrice(model.inputPrice)} / ${formatPrice(model.outputPrice)}`;
}
