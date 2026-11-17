import * as clack from '@clack/prompts';
import spawn from 'cross-spawn';

import type { AgentDefinition } from '../agents/types';
import { agentModels, formatModelPrice, formatTokens, type LoadedCatalog, type Model, pickDefaultModel } from '../core/catalog';
import type { ProbeResult } from '../core/endpoints';
import { type ChosenModel, endpointLabel, formatAge } from '../core/session';
import type { Config } from '../core/store';
import { ask, dim, displayWidth, green, padEnd, padStart } from '../core/ui';
import { t } from '../i18n';

/** Opens a URL in the user's browser. Best effort: returns false when no opener is available. */
export function openUrl(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const [file, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  // A Linux box with no display (SSH, a container) has nothing to open the page in.
  if (process.platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  try {
    const child = spawn(file!, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** `Claude Sonnet 5.5  1M  $2.2 / $11` — what a picker shows next to a model's ID. */
export function modelHint(model: Model): string {
  return [model.name, formatTokens(model.context), formatModelPrice(model)].filter(Boolean).join('  ');
}

/** Sentinel for "let the agent choose", an option only agents with their own model names get. */
const NATIVE = '\u0000native';

/**
 * A searchable model picker for one agent. Models used recently come first,
 * then the default, then the rest strongest first. Resolves to `undefined`
 * when the user leaves the choice to the agent.
 */
export async function pickModel(
  agent: AgentDefinition,
  catalog: LoadedCatalog,
  config: Config,
  current?: string,
): Promise<ChosenModel | undefined> {
  const models = agentModels(catalog.models, agent.protocol);
  const fallback = pickDefaultModel(catalog.models, agent.protocol, agent.preferredModels);
  const recents = (config.recentModels ?? []).flatMap((id) => models.find((model) => model.id === id) ?? []);
  const lead = [...recents, ...(fallback ? [fallback] : [])];
  const ordered = [...lead, ...models].filter((model, index, all) => all.findIndex((other) => other.id === model.id) === index);

  const tag = (model: Model): string =>
    model.id === fallback?.id ? t().modelPickDefault : recents.includes(model) ? t().modelPickRecent : '';

  const options = ordered.map((model) => ({
    value: model.id,
    label: model.id,
    hint: [modelHint(model), tag(model)].filter(Boolean).join('  '),
  }));
  if (!agent.modelRequired) options.unshift({ value: NATIVE, label: t().modelPickKeepNative(agent.name), hint: '' });

  const initial =
    current && ordered.some((model) => model.id === current)
      ? current
      : !agent.modelRequired
        ? NATIVE
        : (fallback?.id ?? ordered[0]?.id);

  const picked = await ask(
    clack.autocomplete<string>({
      message: t().modelPick(agent.name),
      placeholder: t().modelPickPlaceholder,
      options,
      initialValue: initial,
      maxItems: 12,
      filter: (search, option) => {
        const haystack = `${option.label ?? ''} ${option.hint ?? ''}`.toLowerCase();
        return search.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
      },
    }),
  );
  if (picked === NATIVE) return undefined;
  const entry = models.find((model) => model.id === picked);
  return { id: picked, entry };
}

/** One line per endpoint: name, URL, latency; the fastest is marked. */
export function endpointLines(results: readonly ProbeResult[], best: ProbeResult | null): string[] {
  const nameWidth = Math.max(...results.map((result) => displayWidth(endpointLabel(result.endpoint))), 0);
  const urlWidth = Math.max(...results.map((result) => result.endpoint.url.length), 0);
  return results.map((result) => {
    const latency = result.latencyMs === null ? t().endpointUnreachable : `${result.latencyMs} ms`;
    const mark = best && result.endpoint.url === best.endpoint.url ? green(`  ${t().endpointFastest}`) : '';
    return `${padEnd(endpointLabel(result.endpoint), nameWidth)}  ${dim(padEnd(result.endpoint.url, urlWidth))}  ${padStart(latency, 8)}${mark}`;
  });
}

export { formatAge };
