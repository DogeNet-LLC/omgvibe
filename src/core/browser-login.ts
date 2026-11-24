import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** The page on the OhMyGPT website that creates a key for omgvibe once the signed-in user clicks Authorize. */
export const LOGIN_URL = 'https://www.ohmygpt.com/cli/login';

/** `OMGVIBE_LOGIN_URL` points sign-in at another copy of the page, to test one that is not live yet. */
export const loginPage = (env: NodeJS.ProcessEnv): string => env.OMGVIBE_LOGIN_URL || LOGIN_URL;

export interface BrowserLogin {
  /** The page to open: it carries the port to send the key to and this sign-in's state. */
  url: string;
  /** Settles with the key once the page sends it. Stays pending when it never does. */
  key: Promise<string>;
  close(): void;
}

/** What the page checks before it sends a key: only the program that made `state` can answer with this. */
export const proofOf = (state: string): string => createHash('sha256').update(state).digest('hex');

/** A key and its state fit in a fraction of this. */
const MAX_BODY_BYTES = 8 * 1024;

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new Error('The request body is too large.'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function parseCallback(body: string): { state: string; key: string } | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== 'object' || value === null) return null;
    const { state, key } = value as { state?: unknown; key?: unknown };
    return typeof state === 'string' && typeof key === 'string' && key.length > 0 ? { state, key } : null;
  } catch {
    return null;
  }
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Waits on 127.0.0.1 for the key the sign-in page sends after the user clicks Authorize.
 *
 * The page reaches this port with `fetch`, so it can tell whether the key arrived:
 *
 * - `GET /hello` answers `{ proof }`, the SHA-256 of this sign-in's state. The page checks it before sending
 *   anything, so a key never goes to another program that happens to listen on this port where the browser runs.
 * - `POST /callback` takes `{ state, key }`. Only this sign-in's state is accepted, so no other page can plant a key.
 *
 * Requests from any origin but the page's are refused. When the page cannot reach this port, which is the case
 * whenever the browser runs on another machine, it shows the key for the user to paste instead.
 */
export async function startBrowserLogin(page = LOGIN_URL): Promise<BrowserLogin> {
  const origin = new URL(page).origin;
  const state = randomBytes(24).toString('base64url');
  const proof = proofOf(state);
  let deliver!: (key: string) => void;
  const key = new Promise<string>((resolve) => {
    deliver = resolve;
  });

  const answer = async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
    const send = (status: number, body?: unknown, headers: http.OutgoingHttpHeaders = {}): void => {
      response
        .writeHead(status, {
          'access-control-allow-origin': origin,
          vary: 'Origin',
          'cache-control': 'no-store',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        })
        .end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (request.headers.origin !== origin) {
      response.writeHead(403).end();
      return;
    }
    // Browsers ask first before a page on the web may talk to a port on this machine.
    if (request.method === 'OPTIONS') {
      send(204, undefined, {
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-private-network': 'true',
        'access-control-max-age': '600',
      });
      return;
    }
    const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && pathname === '/hello') {
      send(200, { proof });
      return;
    }
    if (request.method === 'POST' && pathname === '/callback') {
      const callback = parseCallback(await readBody(request));
      if (!callback || !sameText(callback.state, state)) {
        send(400, { error: 'This is not the sign-in omgvibe is waiting for.' });
        return;
      }
      send(200, { ok: true });
      deliver(callback.key);
      return;
    }
    send(404, { error: 'Not found.' });
  };

  const server = http.createServer((request, response) => {
    answer(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(400);
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  // A sign-in the user walks away from must not keep the process alive.
  server.unref();
  const { port } = server.address() as AddressInfo;
  return {
    url: `${page}?${new URLSearchParams({ port: String(port), state })}`,
    key,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
