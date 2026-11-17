import { HttpError, httpRequest, parseJson } from './http';

/** Where keys are created, and where a balance is topped up. */
export const KEYS_URL = 'https://www.ohmygpt.com/keys';
export const BILLING_URL = 'https://www.ohmygpt.com/billing';
export const USAGE_URL = 'https://www.ohmygpt.com/usage';
export const MODELS_URL = 'https://www.ohmygpt.com/models';
export const DOCS_URL = 'https://www.ohmygpt.com/docs';

/** The environment variable every OhMyGPT integration reads the key from. */
export const KEY_ENV = 'OHMYGPT_API_KEY';

export interface Account {
  userId: number;
  /** Requests per minute allowed for the account. */
  rpm: number;
  /** False until the first top-up; models only answer after it. */
  toppedUp: boolean;
}

export type KeyCheck =
  | { ok: true; account: Account }
  /** The gateway rejected the key. `code` is its stable error code, e.g. `invalid_api_key`. */
  | { ok: false; reason: 'rejected'; status: number; code?: string; message: string }
  /** Too many failed attempts from this key or address; trying again now only extends the lockout. */
  | { ok: false; reason: 'throttled'; message: string }
  /** The gateway could not be reached or answered with a server error; the key is unverified, not bad. */
  | { ok: false; reason: 'unreachable'; message: string };

interface MeResponse {
  user_id?: number;
  rpm?: number;
  recharge_total_cny?: number;
}

interface ErrorBody {
  error?: { code?: string; message?: string; type?: string };
}

/**
 * Checks a key with `GET /v1/me`. One request only: the gateway counts failed
 * attempts per key and per address and locks out after a handful, so a bad key
 * must never be retried against other endpoints.
 */
export async function checkKey(endpoint: string, apiKey: string, env: NodeJS.ProcessEnv = process.env): Promise<KeyCheck> {
  let response;
  try {
    response = await httpRequest(`${endpoint}/v1/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: 15_000,
      env,
    });
  } catch (error) {
    const message = error instanceof HttpError ? error.message : String(error);
    return { ok: false, reason: 'unreachable', message };
  }

  if (response.status === 200) {
    const me = parseJson<MeResponse>(response);
    if (me && typeof me.user_id === 'number') {
      return {
        ok: true,
        account: { userId: me.user_id, rpm: me.rpm ?? 0, toppedUp: (me.recharge_total_cny ?? 0) > 0 },
      };
    }
    return { ok: false, reason: 'unreachable', message: `${endpoint}/v1/me returned an unexpected body.` };
  }

  const error = parseJson<ErrorBody>(response)?.error;
  const message = error?.message ?? `HTTP ${response.status}`;
  if (response.status === 429) return { ok: false, reason: 'throttled', message };
  if (response.status >= 500) return { ok: false, reason: 'unreachable', message };
  return { ok: false, reason: 'rejected', status: response.status, code: error?.code ?? error?.type, message };
}

/** `sk-abc…wxyz`: enough to recognise a key, never enough to use it. */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 12) return `${apiKey.slice(0, 3)}…`;
  return `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
}

/** Pasted keys often arrive with quotes, a `Bearer ` prefix or stray whitespace, in any nesting. */
export function cleanKey(input: string): string {
  let key = input.trim();
  for (;;) {
    const next = key
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^bearer\s+/i, '')
      .trim();
    if (next === key) return key;
    key = next;
  }
}

/** A reason the text cannot be a key, or `null` when it is plausible. */
export function keyProblem(apiKey: string): 'empty' | 'whitespace' | null {
  if (apiKey.length === 0) return 'empty';
  if (/\s/.test(apiKey)) return 'whitespace';
  return null;
}
