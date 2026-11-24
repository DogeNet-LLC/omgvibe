import { afterEach, describe, expect, it } from 'vitest';

import { type BrowserLogin, LOGIN_URL, loginPage, proofOf, startBrowserLogin } from '../src/core/browser-login';

const ORIGIN = new URL(LOGIN_URL).origin;

/** A request the way the sign-in page's `fetch` makes it: from the page's origin unless told otherwise. */
function request(login: BrowserLogin, path: string, init: RequestInit & { origin?: string | null } = {}): Promise<Response> {
  const { origin = ORIGIN, headers, ...rest } = init;
  const port = new URL(login.url).searchParams.get('port');
  return fetch(`http://127.0.0.1:${port}${path}`, { ...rest, headers: { ...(origin ? { origin } : {}), ...headers } });
}

const send = (login: BrowserLogin, body: unknown, init: RequestInit & { origin?: string | null } = {}): Promise<Response> =>
  request(login, '/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

const stateOf = (login: BrowserLogin): string => new URL(login.url).searchParams.get('state')!;

const stillWaiting = async (login: BrowserLogin): Promise<boolean> =>
  (await Promise.race([login.key, new Promise((resolve) => setTimeout(resolve, 50, 'waiting'))])) === 'waiting';

let login: BrowserLogin | undefined;
afterEach(() => login?.close());

describe('browser login', () => {
  it('opens the sign-in page with a port and a state', async () => {
    login = await startBrowserLogin();
    const page = new URL(login.url);
    expect(`${page.origin}${page.pathname}`).toBe(LOGIN_URL);
    expect(Number(page.searchParams.get('port'))).toBeGreaterThanOrEqual(1024);
    expect(stateOf(login)).toMatch(/^[\w-]{16,128}$/);
  });

  it('proves to the page that it is the program waiting for this sign-in', async () => {
    login = await startBrowserLogin();
    const response = await request(login, '/hello');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await response.json()).toEqual({ proof: proofOf(stateOf(login)) });
  });

  it('takes the key sent with its state', async () => {
    login = await startBrowserLogin();
    const response = await send(login, { state: stateOf(login), key: 'sk-from-browser' });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    await expect(login.key).resolves.toBe('sk-from-browser');
  });

  it('turns away a key without the right state', async () => {
    login = await startBrowserLogin();
    expect((await send(login, { state: 'someone-else-0000', key: 'sk-planted' })).status).toBe(400);
    expect((await send(login, { key: 'sk-planted' })).status).toBe(400);
    expect((await send(login, { state: stateOf(login), key: '' })).status).toBe(400);
    expect((await send(login, 'not json')).status).toBe(400);
    expect((await send(login, { state: stateOf(login), key: 'k'.repeat(10_000) })).status).toBe(400);
    expect(await stillWaiting(login)).toBe(true);
  });

  it('refuses every origin but the sign-in page', async () => {
    login = await startBrowserLogin();
    const state = stateOf(login);
    expect((await request(login, '/hello', { origin: 'https://example.com' })).status).toBe(403);
    expect((await request(login, '/hello', { origin: null })).status).toBe(403);
    expect((await send(login, { state, key: 'sk-planted' }, { origin: 'https://example.com' })).status).toBe(403);
    expect(await stillWaiting(login)).toBe(true);
  });

  it('answers the question a browser asks before a web page may reach this machine', async () => {
    login = await startBrowserLogin();
    const response = await request(login, '/callback', {
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
        'access-control-request-private-network': 'true',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
  });

  it('follows OMGVIBE_LOGIN_URL to another copy of the page', async () => {
    const page = loginPage({ OMGVIBE_LOGIN_URL: 'http://localhost:5173/cli/login' });
    login = await startBrowserLogin(page);
    expect(login.url.startsWith('http://localhost:5173/cli/login?port=')).toBe(true);
    expect((await request(login, '/hello')).status).toBe(403);
    expect((await request(login, '/hello', { origin: 'http://localhost:5173' })).status).toBe(200);
    expect(loginPage({})).toBe(LOGIN_URL);
  });
});
