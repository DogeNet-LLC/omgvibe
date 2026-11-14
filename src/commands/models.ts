import { MODELS_URL } from '../core/account';
import { byStrength, formatModelPrice, formatTokens, isAgentModel, type Model } from '../core/catalog';
import { formatAge, type Options, resolveEndpointFor, tryLoadCatalog } from '../core/session';
import { loadConfig } from '../core/store';
import { CliError, dim, note, table } from '../core/ui';
import { t } from '../i18n';

/** Every search term must appear in the model's ID or name. */
function matches(model: Model, terms: readonly string[]): boolean {
  const haystack = `${model.id} ${model.name}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * `omgvibe models [search…]` lists the chat models an agent can run on, with
 * context window, output limit and price. `--all` lists the whole catalog,
 * `--json` prints the entries as JSON, `--refresh` skips the cache.
 */
export async function modelsCommand(
  args: readonly string[],
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = await loadConfig(env);
  const { endpoint } = await resolveEndpointFor(options, config, env);
  const catalog = await tryLoadCatalog(endpoint.url, env, options.refresh);
  if (!catalog) throw new CliError(t().modelsLoadFailed(endpoint.url), [t().doctorHintNetwork]);
  if (catalog.stale) note.warn(t().modelsStale(formatAge(catalog.fetchedAt)));

  const terms = args.flatMap((arg) => arg.toLowerCase().split(/\s+/)).filter(Boolean);
  // Every chat model accepts all three protocols, so one protocol stands in for "usable by an agent".
  const pool = options.all ? catalog.models : catalog.models.filter((model) => isAgentModel(model, 'openai-completions'));
  const shown = pool.filter((model) => matches(model, terms)).sort(byStrength);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
    return;
  }
  if (shown.length === 0) {
    process.stdout.write(`${t().modelsNone}\n`);
    if (!options.all) process.stdout.write(`${dim(t().modelsHintAll)}\n`);
    return;
  }

  const rows = shown.map((model) => [
    model.id,
    model.context > 0 ? formatTokens(model.context) : '',
    model.maxOutput ? formatTokens(model.maxOutput) : '',
    formatModelPrice(model),
    model.score !== undefined ? model.score.toFixed(1) : '',
  ]);
  process.stdout.write(
    `${table(
      [
        { header: t().modelsColId },
        { header: t().modelsColContext, align: 'right' },
        { header: t().modelsColOutput, align: 'right' },
        { header: t().modelsColPrice },
        { header: t().modelsColScore, align: 'right' },
      ],
      rows,
    )}\n`,
  );
  process.stdout.write(`\n${dim(t().modelsCount(shown.length, catalog.models.length))}\n`);
  if (!options.all) process.stdout.write(`${dim(t().modelsHintAll)}\n`);
  process.stdout.write(`${dim(t().modelsPrices(MODELS_URL))}\n`);
}
