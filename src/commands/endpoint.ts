import * as clack from '@clack/prompts';

import { ENDPOINTS, fastest, probeAll, resolveEndpoint } from '../core/endpoints';
import { endpointLabel, type Options } from '../core/session';
import { loadConfig, updateConfig } from '../core/store';
import { ask, CliError, isInteractive } from '../core/ui';
import { t } from '../i18n';
import { endpointLines } from './common';

const AUTO = 'auto';

async function pin(url: string, env: NodeJS.ProcessEnv): Promise<void> {
  await updateConfig((config) => {
    config.endpoint = url;
    config.endpointPinned = true;
    config.endpointProbedAt = Date.now();
  }, env);
}

async function setAuto(url: string | undefined, env: NodeJS.ProcessEnv): Promise<void> {
  await updateConfig((config) => {
    if (url) config.endpoint = url;
    config.endpointPinned = false;
    config.endpointProbedAt = url ? Date.now() : 0;
  }, env);
}

/**
 * `omgvibe endpoint` measures every endpoint and lets the user keep the
 * fastest (re-measured over time) or pin one. `omgvibe endpoint <region|url>`
 * pins without asking; `omgvibe endpoint auto` returns to automatic.
 */
export async function endpointCommand(
  args: readonly string[],
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const target = args[0];

  if (target && target.toLowerCase() !== AUTO) {
    let endpoint;
    try {
      endpoint = resolveEndpoint(target);
    } catch {
      throw new CliError(t().errBadEndpoint(target));
    }
    await pin(endpoint.url, env);
    process.stdout.write(`${t().endpointSet(endpointLabel(endpoint), endpoint.url)}\n${t().endpointPinned}\n`);
    return;
  }

  const interactive = isInteractive() && !options.yes && !options.json && !target;
  const spinner = interactive ? clack.spinner() : null;
  spinner?.start(t().endpointMeasuring);
  const results = await probeAll(ENDPOINTS, { env });
  const best = fastest(results);
  spinner?.stop(t().endpointMeasured);

  if (options.json) {
    const config = await loadConfig(env);
    process.stdout.write(
      `${JSON.stringify(
        {
          current: config.endpoint ?? null,
          pinned: Boolean(config.endpointPinned),
          fastest: best?.endpoint.url ?? null,
          endpoints: results.map((result) => ({ id: result.endpoint.id, url: result.endpoint.url, latency_ms: result.latencyMs })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (!interactive) {
    process.stdout.write(`${endpointLines(results, best).join('\n')}\n`);
    if (!best) throw new CliError(t().endpointNoneReachable);
    // `auto`, or a bare call from a script: keep following the fastest.
    await setAuto(best.endpoint.url, env);
    process.stdout.write(`${t().endpointSet(endpointLabel(best.endpoint), best.endpoint.url)}\n${t().endpointAutoSet}\n`);
    return;
  }

  if (!best) clack.log.warn(t().endpointNoneReachable);
  const config = await loadConfig(env);
  const lines = endpointLines(results, best);
  const choice = await ask(
    clack.select<string>({
      message: t().endpointChoose,
      initialValue: config.endpointPinned && config.endpoint ? config.endpoint : AUTO,
      options: [
        { value: AUTO, label: t().endpointAuto },
        ...results.map((result, index) => ({ value: result.endpoint.url, label: lines[index]! })),
      ],
    }),
  );
  if (choice === AUTO) {
    await setAuto(best?.endpoint.url, env);
    clack.outro(best ? `${t().endpointSet(endpointLabel(best.endpoint), best.endpoint.url)} ${t().endpointAutoSet}` : t().endpointAutoSet);
    return;
  }
  const chosen = resolveEndpoint(choice);
  await pin(chosen.url, env);
  clack.outro(`${t().endpointSet(endpointLabel(chosen), chosen.url)} ${t().endpointPinned}`);
}
