import { AGENTS, detectAll } from '../agents';
import { checkKey, type KeyCheck, maskKey } from '../core/account';
import { tildify } from '../core/paths';
import { type EndpointSource, endpointLabel, type KeySource, type Options, resolveEndpointFor, resolveKey } from '../core/session';
import { loadSetupState } from '../core/setup-state';
import { loadConfig } from '../core/store';
import { bold, dim, formatInt, green, padEnd, red, yellow } from '../core/ui';
import { VERSION } from '../core/version';
import { t } from '../i18n';

const keySourceLabel = (source: KeySource): string =>
  source === 'flag' ? t().statusKeyFlag : source === 'env' ? t().statusKeyEnv : t().statusKeySaved;

const endpointSourceLabel = (source: EndpointSource): string =>
  source === 'pinned' || source === 'flag' || source === 'env'
    ? t().statusEndpointPinned
    : source === 'default'
      ? t().statusEndpointDefault
      : t().statusEndpointAuto;

function accountLine(masked: string, source: KeySource, check: KeyCheck): string {
  const who = `${masked} (${keySourceLabel(source)})`;
  if (check.ok) return `${green('✓')} ${who}  #${check.account.userId}  ${formatInt(check.account.rpm)} RPM`;
  if (check.reason === 'rejected') return `${red('✗')} ${who}  ${t().loginRejected(check.message)}`;
  if (check.reason === 'throttled') return `${yellow('!')} ${who}  ${t().loginThrottled}`;
  return `${yellow('!')} ${who}  ${t().loginUnverified(check.message)}`;
}

/** `omgvibe status`: who is signed in, which endpoint is in use, and which agents are installed and set up. */
export async function statusCommand(options: Options, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadConfig(env);
  const key = resolveKey(options, config, env);
  const [{ endpoint, source }, agents, state] = await Promise.all([
    resolveEndpointFor(options, config, env),
    detectAll(env),
    loadSetupState(env),
  ]);
  const check = key ? await checkKey(endpoint.url, key.key, env) : null;

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: VERSION,
          account: key
            ? {
                key: maskKey(key.key),
                source: key.source,
                valid: check?.ok ?? false,
                ...(check?.ok ? { user_id: check.account.userId, rpm: check.account.rpm, topped_up: check.account.toppedUp } : {}),
              }
            : null,
          endpoint: { id: endpoint.id, url: endpoint.url, source },
          agents: agents.map(({ agent, path, version }) => ({
            id: agent.id,
            name: agent.name,
            installed: path !== null,
            path,
            version: version ?? null,
            default_model: config.models?.[agent.id] ?? null,
            setup: state.agents[agent.id]
              ? { model: state.agents[agent.id]!.model ?? null, files: state.agents[agent.id]!.files.map((file) => file.path) }
              : null,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const lines: string[] = [`${bold('omgvibe')} ${VERSION}`, ''];
  lines.push(bold(t().statusAccount));
  lines.push(`  ${key && check ? accountLine(maskKey(key.key), key.source, check) : `${yellow('!')} ${t().statusSignedOut}  ${dim(t().errNotSignedInHint)}`}`);
  lines.push('', bold(t().statusEndpoint));
  lines.push(`  ${endpointLabel(endpoint)}  ${dim(endpoint.url)}  ${dim(endpointSourceLabel(source))}`);
  lines.push('', bold(t().statusAgents));

  const nameWidth = Math.max(...AGENTS.map((agent) => agent.name.length));
  const commandWidth = Math.max(...AGENTS.map((agent) => `omgvibe ${agent.id}`.length));
  const versionWidth = Math.max(...agents.map(({ path, version }) => (path ? (version ?? '').length : t().notInstalled.length)));
  for (const { agent, path, version } of agents) {
    const setup = state.agents[agent.id];
    const installed = path ? padEnd(version ?? '', versionWidth) : dim(padEnd(t().notInstalled, versionWidth));
    const details = [
      setup
        ? `${t().statusSetupApplied}: ${setup.files.map((file) => tildify(file.path, env)).join(', ')}`
        : path
          ? dim(t().statusSetupNone)
          : '',
      config.models?.[agent.id] ? dim(t().statusDefaultModel(config.models[agent.id]!)) : '',
    ].filter(Boolean);
    lines.push(
      `  ${path ? green('✓') : dim('–')} ${padEnd(agent.name, nameWidth)}  ${dim(padEnd(`omgvibe ${agent.id}`, commandWidth))}  ${installed}  ${details.join('  ')}`.trimEnd(),
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}
