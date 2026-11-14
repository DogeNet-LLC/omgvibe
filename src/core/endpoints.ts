import { createAgent, httpRequest } from './http';

/**
 * OhMyGPT's regional API endpoints. Same API and same key on each; they differ
 * only in network route, so the right one is whichever answers fastest from
 * where the user sits. The list mirrors the endpoint picker on
 * https://www.ohmygpt.com/keys.
 */
export type EndpointId = 'cloudflare' | 'us' | 'asia' | 'cn2' | 'sg' | 'eu';

export interface Endpoint {
  /** A known region id, or `custom` for a URL the user supplied. */
  id: EndpointId | 'custom';
  /** Base URL without a trailing slash and without `/v1`. */
  url: string;
}

export const ENDPOINTS: readonly Endpoint[] = [
  { id: 'cloudflare', url: 'https://apic1.ohmycdn.com' },
  { id: 'us', url: 'https://api.ohmygpt.com' },
  { id: 'asia', url: 'https://c-z0-api-01.hash070.com' },
  { id: 'cn2', url: 'https://cn2us02.opapi.win' },
  { id: 'sg', url: 'https://api-ep-sg1.ohmygpt.com' },
  { id: 'eu', url: 'https://api-ep-eu1.ohmygpt.com' },
];

/** The endpoint the documentation uses; the fallback when nothing has been measured. */
export const DEFAULT_ENDPOINT: Endpoint = ENDPOINTS[1]!;

const PING_PATH = '/api/v1/ping';

/** `https://host/v1/` → `https://host`. Throws on anything that is not an http(s) URL. */
export function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1]?.toLowerCase();
  if (scheme !== undefined && scheme !== 'http' && scheme !== 'https') throw new Error(`Not an http(s) URL: ${input}`);
  const url = new URL(scheme ? raw : `https://${raw}`);
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
  return `${url.origin}${pathname}`;
}

/**
 * Turns `--endpoint` input into an endpoint: a region id (`cn2`), one of the
 * known URLs, or any other base URL (a self-hosted mirror, a local gateway).
 */
export function resolveEndpoint(input: string): Endpoint {
  const value = input.trim();
  const byId = ENDPOINTS.find((endpoint) => endpoint.id === value.toLowerCase());
  if (byId) return byId;
  const url = normalizeBaseUrl(value);
  return ENDPOINTS.find((endpoint) => endpoint.url === url) ?? { id: 'custom', url };
}

export interface ProbeResult {
  endpoint: Endpoint;
  /** Median round trip on a warm connection, or `null` when unreachable. */
  latencyMs: number | null;
  error?: string;
}

export interface ProbeOptions {
  /** Requests per endpoint. The first one pays for DNS and TLS and is only used when it is the sole success. */
  attempts?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Measures one endpoint. Agents keep their connection open, so what matters is
 * the round trip on a warm connection: requests run in sequence over one
 * keep-alive socket and the first (cold) sample is set aside. Any HTTP answer
 * counts as reachable; only the network is being measured.
 */
export async function probeEndpoint(endpoint: Endpoint, options: ProbeOptions = {}): Promise<ProbeResult> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 5000;
  const target = new URL(endpoint.url + PING_PATH);
  const agent = createAgent(target, options.env);
  const samples: number[] = [];
  let error: string | undefined;
  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await httpRequest(target, { agent, timeoutMs, env: options.env });
        samples.push(response.elapsedMs);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        // A dead endpoint would otherwise cost attempts × timeout.
        if (samples.length === 0) break;
      }
    }
  } finally {
    agent.destroy();
  }
  if (samples.length === 0) return { endpoint, latencyMs: null, error };
  const warm = samples.length > 1 ? samples.slice(1) : samples;
  return { endpoint, latencyMs: Math.round(median(warm)) };
}

/** Measures every endpoint at once; results keep the input order. */
export function probeAll(endpoints: readonly Endpoint[], options: ProbeOptions = {}): Promise<ProbeResult[]> {
  return Promise.all(endpoints.map((endpoint) => probeEndpoint(endpoint, options)));
}

/** The reachable endpoint with the lowest latency, or `null` when none answered. */
export function fastest(results: readonly ProbeResult[]): ProbeResult | null {
  return results.reduce<ProbeResult | null>((best, result) => {
    if (result.latencyMs === null) return best;
    return best === null || result.latencyMs < best.latencyMs! ? result : best;
  }, null);
}
