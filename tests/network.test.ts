import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkKey, cleanKey, keyProblem, maskKey } from '../src/core/account';
import { ENDPOINTS, fastest, normalizeBaseUrl, probeAll, probeEndpoint, resolveEndpoint } from '../src/core/endpoints';
import { bypassesProxy, HttpError, httpRequest, proxyFor } from '../src/core/http';
import { MOCK_KEY, type MockGateway, startMockGateway } from './helpers/mock-gateway';

let gateway: MockGateway;
beforeAll(async () => {
  gateway = await startMockGateway();
});
afterAll(() => gateway.close());

describe('endpoints', () => {
  it('normalises base URLs', () => {
    expect(normalizeBaseUrl('https://api.ohmygpt.com/v1/')).toBe('https://api.ohmygpt.com');
    expect(normalizeBaseUrl('api.ohmygpt.com')).toBe('https://api.ohmygpt.com');
    expect(normalizeBaseUrl('http://127.0.0.1:9730/gw/v1')).toBe('http://127.0.0.1:9730/gw');
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow();
  });

  it('resolves a region id, a known URL and a custom URL', () => {
    expect(resolveEndpoint('CN2')).toEqual({ id: 'cn2', url: 'https://cn2us02.opapi.win' });
    expect(resolveEndpoint('https://api.ohmygpt.com/v1').id).toBe('us');
    expect(resolveEndpoint('http://127.0.0.1:9730')).toEqual({ id: 'custom', url: 'http://127.0.0.1:9730' });
    expect(new Set(ENDPOINTS.map((endpoint) => endpoint.url)).size).toBe(ENDPOINTS.length);
  });

  it('measures a reachable endpoint and reports an unreachable one', async () => {
    const [up, down] = await probeAll(
      [
        { id: 'custom', url: gateway.url },
        { id: 'custom', url: 'http://127.0.0.1:9' },
      ],
      { timeoutMs: 2000 },
    );
    expect(up!.latencyMs).toBeTypeOf('number');
    expect(down!.latencyMs).toBeNull();
    expect(down!.error).toBeTruthy();
    expect(fastest([up!, down!])).toBe(up);
    expect(fastest([down!])).toBeNull();
  });

  it('counts any HTTP answer as reachable', async () => {
    // The mock answers /api/v1/ping; a gateway without that route answers 404 and is still reachable.
    const server = http.createServer((_, response) => response.writeHead(404).end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const result = await probeEndpoint({ id: 'custom', url: `http://127.0.0.1:${port}` });
    server.close();
    expect(result.latencyMs).toBeTypeOf('number');
  });
});

describe('account', () => {
  it('accepts a good key and reports the account', async () => {
    await expect(checkKey(gateway.url, MOCK_KEY)).resolves.toEqual({ ok: true, account: { userId: 4242, rpm: 1000, toppedUp: true } });
  });

  it('distinguishes a rejected key from an unreachable gateway', async () => {
    await expect(checkKey(gateway.url, 'sk-wrong')).resolves.toMatchObject({ ok: false, reason: 'rejected', status: 401, code: 'invalid_api_key' });
    await expect(checkKey('http://127.0.0.1:9', MOCK_KEY)).resolves.toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('reports an account that has never topped up', async () => {
    const fresh = await startMockGateway({ neverToppedUp: true });
    await expect(checkKey(fresh.url, MOCK_KEY)).resolves.toMatchObject({ ok: true, account: { toppedUp: false } });
    await fresh.close();
  });

  it('cleans pasted keys and never shows a whole one', () => {
    expect(cleanKey('  "Bearer sk-abc123"\n')).toBe('sk-abc123');
    expect(keyProblem('')).toBe('empty');
    expect(keyProblem('sk a')).toBe('whitespace');
    expect(keyProblem('sk-abc')).toBeNull();
    expect(maskKey('sk-0123456789abcdefwxyz')).toBe('sk-012…wxyz');
    expect(maskKey('short')).toBe('sho…');
  });
});

describe('http', () => {
  it('honours NO_PROXY rules', () => {
    const url = new URL('https://api.ohmygpt.com/v1/models');
    expect(bypassesProxy(url, undefined)).toBe(false);
    expect(bypassesProxy(url, '*')).toBe(true);
    expect(bypassesProxy(url, 'localhost, .ohmygpt.com')).toBe(true);
    expect(bypassesProxy(url, 'ohmygpt.com:443')).toBe(true);
    expect(bypassesProxy(url, 'ohmygpt.com:8443')).toBe(false);
    expect(bypassesProxy(url, 'notohmygpt.com,example.com')).toBe(false);
  });

  it('picks the proxy for the scheme and ignores proxies it cannot drive', () => {
    const https = new URL('https://api.ohmygpt.com');
    expect(proxyFor(https, {})).toBeNull();
    expect(proxyFor(https, { HTTPS_PROXY: 'http://127.0.0.1:7890' })?.host).toBe('127.0.0.1:7890');
    expect(proxyFor(https, { https_proxy: '127.0.0.1:7890' })?.href).toBe('http://127.0.0.1:7890/');
    expect(proxyFor(https, { HTTP_PROXY: 'http://127.0.0.1:1' })).toBeNull();
    expect(proxyFor(https, { ALL_PROXY: 'http://127.0.0.1:2' })?.port).toBe('2');
    expect(proxyFor(https, { ALL_PROXY: 'socks5://127.0.0.1:1080' })).toBeNull();
    expect(proxyFor(https, { HTTPS_PROXY: 'http://127.0.0.1:7890', NO_PROXY: 'api.ohmygpt.com' })).toBeNull();
  });

  it('sends a plain-HTTP request through an HTTP proxy', async () => {
    const seen: string[] = [];
    const proxy = http.createServer((request, response) => {
      seen.push(request.url ?? '');
      const target = new URL(request.url!);
      const upstream = http.request({ host: target.hostname, port: target.port, path: target.pathname, method: request.method, headers: request.headers }, (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      });
      request.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const { port } = proxy.address() as AddressInfo;
    const response = await httpRequest(`${gateway.url}/api/v1/ping`, { env: { HTTP_PROXY: `http://127.0.0.1:${port}` } });
    proxy.close();
    expect(response.status).toBe(200);
    expect(seen).toEqual([`${gateway.url}/api/v1/ping`]);
  });

  it('reports a proxy that refuses the tunnel', async () => {
    const proxy = http.createServer();
    proxy.on('connect', (_request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const { port } = proxy.address() as AddressInfo;
    const failure = httpRequest('https://api.ohmygpt.com/api/v1/ping', { env: { HTTPS_PROXY: `http://127.0.0.1:${port}` }, timeoutMs: 3000 });
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({ kind: 'proxy' });
    proxy.close();
  });

  it('times out instead of hanging', async () => {
    const slow = await startMockGateway({ delayMs: 400 });
    await expect(httpRequest(`${slow.url}/api/v1/ping`, { timeoutMs: 80 })).rejects.toMatchObject({ kind: 'timeout' });
    await slow.close();
  });
});
