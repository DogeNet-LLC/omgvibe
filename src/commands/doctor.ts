import { BILLING_URL, checkKey, KEYS_URL } from '../core/account';
import { fetchCatalog, MOCK_MODEL, type Protocol } from '../core/catalog';
import { probeEndpoint } from '../core/endpoints';
import { HttpError, httpRequest, parseJson } from '../core/http';
import { endpointLabel, type Options, requireKey, resolveEndpointFor } from '../core/session';
import { loadConfig } from '../core/store';
import { bold, CliError, dim, displayWidth, green, padEnd, red } from '../core/ui';
import { t } from '../i18n';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

interface ErrorBody {
  error?: { code?: string; message?: string; type?: string };
}

/** One minimal request per protocol, to the free test model. */
const PROTOCOL_CALLS: Array<{ protocol: Protocol; path: string; headers?: Record<string, string>; body: unknown }> = [
  {
    protocol: 'openai-completions',
    path: '/v1/chat/completions',
    body: { model: MOCK_MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 32 },
  },
  { protocol: 'openai-responses', path: '/v1/responses', body: { model: MOCK_MODEL, input: 'ping' } },
  {
    protocol: 'anthropic-messages',
    path: '/v1/messages',
    headers: { 'anthropic-version': '2023-06-01' },
    body: { model: MOCK_MODEL, max_tokens: 32, messages: [{ role: 'user', content: 'ping' }] },
  },
];

function failureHint(status: number): string | undefined {
  if (status === 401) return t().doctorHintKey(KEYS_URL);
  if (status === 402 || status === 403) return t().doctorHintTopUp(BILLING_URL);
  return undefined;
}

async function protocolCheck(
  endpoint: string,
  apiKey: string,
  call: (typeof PROTOCOL_CALLS)[number],
  env: NodeJS.ProcessEnv,
): Promise<Check> {
  const name = t().doctorProtocol(t().protocolName[call.protocol]);
  try {
    const response = await httpRequest(`${endpoint}${call.path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, ...call.headers },
      body: call.body,
      timeoutMs: 30_000,
      env,
    });
    if (response.status === 200) return { name, ok: true, detail: t().doctorProtocolOk(Math.round(response.elapsedMs)) };
    const message = parseJson<ErrorBody>(response)?.error?.message ?? response.body.slice(0, 160);
    return { name, ok: false, detail: t().doctorHttp(response.status, message), hint: failureHint(response.status) };
  } catch (error) {
    const detail = error instanceof HttpError ? error.message : String(error);
    return { name, ok: false, detail, hint: t().doctorHintNetwork };
  }
}

/**
 * `omgvibe doctor` checks the whole path an agent depends on: the key, the
 * endpoint, the model list, and one real request through each protocol. The
 * requests go to the free test model, so running it costs nothing.
 */
export async function doctorCommand(options: Options, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadConfig(env);
  const { key } = requireKey(options, config, env);
  const { endpoint } = await resolveEndpointFor(options, config, env);
  if (!options.json) process.stdout.write(`${bold(t().doctorIntro)}  ${dim(`${endpointLabel(endpoint)}  ${endpoint.url}`)}\n`);

  const checks: Check[] = [];
  // Every check's name is known up front, so the details can line up in one column.
  const nameWidth = Math.max(
    ...[t().doctorEndpoint, t().doctorKey, t().doctorCatalog, ...PROTOCOL_CALLS.map((call) => t().doctorProtocol(t().protocolName[call.protocol]))].map(displayWidth),
  );
  const report = (check: Check): void => {
    checks.push(check);
    if (options.json) return;
    process.stdout.write(`  ${check.ok ? green('✓') : red('✗')} ${padEnd(check.name, nameWidth)}  ${check.ok ? dim(check.detail) : check.detail}\n`);
    if (!check.ok && check.hint) process.stdout.write(`    ${dim(check.hint)}\n`);
  };

  const probe = await probeEndpoint(endpoint, { env });
  report(
    probe.latencyMs === null
      ? { name: t().doctorEndpoint, ok: false, detail: probe.error ?? t().endpointUnreachable, hint: t().doctorHintNetwork }
      : { name: t().doctorEndpoint, ok: true, detail: t().doctorEndpointOk(probe.latencyMs) },
  );

  const keyCheck = await checkKey(endpoint.url, key, env);
  report(
    keyCheck.ok
      ? { name: t().doctorKey, ok: true, detail: t().doctorKeyOk(keyCheck.account.userId) }
      : {
          name: t().doctorKey,
          ok: false,
          detail: keyCheck.reason === 'throttled' ? t().loginThrottled : keyCheck.message,
          hint: keyCheck.reason === 'rejected' ? t().doctorHintKey(KEYS_URL) : keyCheck.reason === 'unreachable' ? t().doctorHintNetwork : undefined,
        },
  );

  try {
    const catalog = await fetchCatalog(endpoint.url, env);
    report({ name: t().doctorCatalog, ok: true, detail: t().doctorCatalogOk(catalog.models.length) });
  } catch (error) {
    report({ name: t().doctorCatalog, ok: false, detail: error instanceof Error ? error.message : String(error), hint: t().doctorHintNetwork });
  }

  // A rejected key fails every request the same way, and repeating it counts towards the gateway's lockout.
  if (keyCheck.ok || keyCheck.reason === 'unreachable') {
    for (const call of PROTOCOL_CALLS) report(await protocolCheck(endpoint.url, key, call, env));
  }

  const failed = checks.filter((check) => !check.ok).length;
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: failed === 0, endpoint: endpoint.url, checks }, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${failed === 0 ? green(t().doctorAllGood) : red(t().doctorSomeFailed(failed))}  ${dim(t().doctorFree)}\n`);
  }
  if (failed > 0) throw new CliError('', [], 1);
}
