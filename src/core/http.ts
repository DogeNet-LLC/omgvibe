import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import zlib from 'node:zlib';

import { VERSION } from './version';

/**
 * omgvibe's own HTTP client (model catalog, key check, latency probes).
 *
 * It honours `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` and `NO_PROXY`, because
 * the agents it launches do: measuring an endpoint over a different route than
 * the agent will use would pick the wrong one. Node's built-in `fetch` ignores
 * these variables, which is why this is not `fetch`.
 */

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Sent as JSON. */
  body?: unknown;
  /** Whole-request deadline, connect to last byte. */
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  /** Connection pool to reuse; lets latency probes measure a warm connection. */
  agent?: http.Agent | https.Agent;
}

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  /** Wall time from request start to the last byte. */
  elapsedMs: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'proxy' | 'aborted',
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const USER_AGENT = `omgvibe/${VERSION} (node ${process.versions.node}; ${process.platform})`;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

// ---------------------------------------------------------------------------
// proxy resolution
// ---------------------------------------------------------------------------

const envValue = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name.toLowerCase()] ?? env[name.toUpperCase()];
  return value?.trim() || undefined;
};

/** `NO_PROXY` matching: `*`, exact hosts, `.suffix` / `suffix` domains, optional `:port`. */
export function bypassesProxy(target: URL, noProxy: string | undefined): boolean {
  if (!noProxy) return false;
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = target.port || (target.protocol === 'https:' ? '443' : '80');
  return noProxy
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') return true;
      let rule = entry.toLowerCase();
      const portMatch = /:(\d+)$/.exec(rule);
      if (portMatch) {
        if (portMatch[1] !== port) return false;
        rule = rule.slice(0, -portMatch[0].length);
      }
      rule = rule.replace(/^\*?\./, '');
      return host === rule || host.endsWith(`.${rule}`);
    });
}

/**
 * The proxy to use for `target`, or `null` to connect directly. Only HTTP(S)
 * proxies can be driven from here; a SOCKS proxy is ignored and the request
 * goes direct.
 */
export function proxyFor(target: URL, env: NodeJS.ProcessEnv = process.env): URL | null {
  if (bypassesProxy(target, envValue(env, 'no_proxy'))) return null;
  const raw =
    (target.protocol === 'https:' ? envValue(env, 'https_proxy') : envValue(env, 'http_proxy')) ??
    envValue(env, 'all_proxy');
  if (!raw) return null;
  let proxy: URL;
  try {
    proxy = new URL(raw.includes('://') ? raw : `http://${raw}`);
  } catch {
    return null;
  }
  return proxy.protocol === 'http:' || proxy.protocol === 'https:' ? proxy : null;
}

const proxyAuthHeader = (proxy: URL): Record<string, string> =>
  proxy.username
    ? {
        'Proxy-Authorization': `Basic ${Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString('base64')}`,
      }
    : {};

/** Opens a CONNECT tunnel through `proxy` and resolves with the raw socket to `host:port`. */
function openTunnel(proxy: URL, host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const lib = proxy.protocol === 'https:' ? https : http;
    const request = lib.request({
      host: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers: { Host: `${host}:${port}`, ...proxyAuthHeader(proxy) },
      timeout: timeoutMs,
    });
    request.once('connect', (response, socket) => {
      if (response.statusCode === 200) {
        resolve(socket);
        return;
      }
      socket.destroy();
      reject(new HttpError(`Proxy ${proxy.host} refused the tunnel (HTTP ${response.statusCode}).`, 'proxy'));
    });
    request.once('timeout', () => request.destroy(new HttpError(`Proxy ${proxy.host} timed out.`, 'timeout')));
    request.once('error', (error) =>
      reject(error instanceof HttpError ? error : new HttpError(`Proxy ${proxy.host}: ${error.message}`, 'proxy')),
    );
    request.end();
  });
}

/**
 * An HTTPS agent whose connections go through an HTTP CONNECT tunnel. Sockets
 * are pooled like any keep-alive agent, so a warm probe reuses the tunnel.
 */
class TunnelAgent extends https.Agent {
  constructor(
    private readonly proxy: URL,
    private readonly tunnelTimeoutMs: number,
  ) {
    super({ keepAlive: true });
  }

  override createConnection(
    options: https.RequestOptions,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    const host = String(options.host ?? options.hostname);
    const port = Number(options.port ?? 443);
    openTunnel(this.proxy, host, port, this.tunnelTimeoutMs).then(
      (socket) => {
        const secure = tls.connect({ socket, servername: options.servername ?? host });
        callback?.(null, secure);
      },
      // On failure there is no stream to hand over; Node only reads the error.
      (error: Error) => callback?.(error, undefined as unknown as Duplex),
    );
    // The socket is delivered through the callback once the tunnel is up.
    return undefined;
  }
}

/**
 * A keep-alive connection pool for `target`, proxy-aware. Pass it to several
 * `httpRequest` calls to reuse one connection, then `destroy()` it.
 */
export function createAgent(target: URL, env: NodeJS.ProcessEnv = process.env): http.Agent | https.Agent {
  const proxy = proxyFor(target, env);
  if (target.protocol === 'https:') {
    return proxy ? new TunnelAgent(proxy, DEFAULT_TIMEOUT_MS) : new https.Agent({ keepAlive: true });
  }
  return new http.Agent({ keepAlive: true });
}

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

function decodeBody(buffer: Buffer, encoding: string | undefined): string {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip':
      return zlib.gunzipSync(buffer).toString('utf8');
    case 'br':
      return zlib.brotliDecompressSync(buffer).toString('utf8');
    case 'deflate':
      return zlib.inflateSync(buffer).toString('utf8');
    default:
      return buffer.toString('utf8');
  }
}

export function httpRequest(url: string | URL, options: HttpOptions = {}): Promise<HttpResponse> {
  const target = new URL(url);
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const secure = target.protocol === 'https:';
  if (!secure && target.protocol !== 'http:') {
    return Promise.reject(new HttpError(`Unsupported URL scheme: ${target.protocol}`, 'network'));
  }

  const proxy = proxyFor(target, env);
  const payload = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body), 'utf8');
  const headers: Record<string, string | number> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, br',
    ...options.headers,
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = payload.byteLength;
  }

  // A plain-HTTP target through a proxy is sent to the proxy with the absolute URL as the path.
  const viaPlainProxy = !secure && proxy !== null;
  const ownAgent = options.agent === undefined;
  const agent = options.agent ?? createAgent(target, env);

  const requestOptions: https.RequestOptions = viaPlainProxy
    ? {
        host: proxy.hostname,
        port: proxy.port || 80,
        path: target.toString(),
        headers: { ...headers, Host: target.host, ...proxyAuthHeader(proxy) },
      }
    : {
        host: target.hostname,
        port: target.port || (secure ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers,
        agent,
      };
  requestOptions.method = options.method ?? (payload ? 'POST' : 'GET');

  return new Promise<HttpResponse>((resolve, reject) => {
    const started = performance.now();
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (ownAgent) agent.destroy();
      action();
    };
    const fail = (error: HttpError): void => finish(() => reject(error));

    const lib = secure && !viaPlainProxy ? https : http;
    const request = lib.request(requestOptions, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES) {
          request.destroy();
          fail(new HttpError(`Response from ${target.host} is too large.`, 'network'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => fail(new HttpError(`${target.host}: ${error.message}`, 'network')));
      response.on('end', () => {
        const elapsedMs = performance.now() - started;
        let body: string;
        try {
          body = decodeBody(Buffer.concat(chunks), response.headers['content-encoding']);
        } catch {
          fail(new HttpError(`Could not decode the response from ${target.host}.`, 'network'));
          return;
        }
        finish(() => resolve({ status: response.statusCode ?? 0, headers: response.headers, body, elapsedMs }));
      });
    });

    const onAbort = (): void => {
      request.destroy();
      fail(new HttpError('Request aborted.', 'aborted'));
    };
    const timer = setTimeout(() => {
      request.destroy();
      fail(new HttpError(`${target.host} did not answer within ${Math.round(timeoutMs / 1000)}s.`, 'timeout'));
    }, timeoutMs);

    request.on('error', (error: NodeJS.ErrnoException) => {
      if (error instanceof HttpError) {
        fail(error);
        return;
      }
      fail(new HttpError(`${target.host}: ${error.message}`, 'network', error.code));
    });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    request.end(payload);
  });
}

/** Parses a JSON body, or returns `null` when it is not JSON (an HTML error page, for instance). */
export function parseJson<T>(response: HttpResponse): T | null {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    return null;
  }
}
