import * as clack from '@clack/prompts';
import spawn from 'cross-spawn';

import { locate, readVersion } from '../agents';
import type { AgentDefinition, InstallMethod } from '../agents/types';
import { agentModels } from '../core/catalog';
import { userHome } from '../core/paths';
import { runInteractive } from '../core/process';
import { SessionScratch } from '../core/scratch';
import {
  attributionFor,
  type ChosenModel,
  endpointLabel,
  type Options,
  resolveDefaultModel,
  resolveEndpointFor,
  resolveNamedModel,
  tryLoadCatalog,
} from '../core/session';
import { loadConfig, rememberModel, updateConfig } from '../core/store';
import { ask, CliError, confirm, isInteractive, note } from '../core/ui';
import { t } from '../i18n';
import { pickModel } from './common';
import { ensureKey } from './login';

const methodsFor = (agent: AgentDefinition): InstallMethod[] =>
  agent.install.filter((method) => !method.platforms || method.platforms.includes(process.platform));

/** Runs one install method with the terminal attached, so the installer's own output and prompts show. */
function runInstall(method: InstallMethod, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const [file, args] =
      method.run.kind === 'exec'
        ? [method.run.file, method.run.args]
        : method.run.shell === 'powershell'
          ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', method.command]]
          : ['sh', ['-c', method.command]];
    const child = spawn(file, args, { stdio: 'inherit', env });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Makes sure the agent is installed and returns its executable. When it is
 * missing: asks before installing in a terminal, installs straight away with
 * `--install`, and otherwise stops with the commands to run.
 */
export async function ensureInstalled(
  agent: AgentDefinition,
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const found = locate(agent, env);
  if (found) return found;

  const methods = methodsFor(agent);
  const manual = new CliError(t().launchMissing(agent.name), [
    t().launchInstallManual(agent.name),
    ...methods.map((method) => `  ${method.command}`),
    `  ${agent.homepage}`,
  ]);
  const interactive = isInteractive() && !options.yes;
  if (methods.length === 0 || (!interactive && !options.install)) throw manual;

  let method = methods[0]!;
  if (interactive && !options.install) {
    clack.log.warn(t().launchMissing(agent.name));
    if (methods.length > 1) {
      const picked = await ask(
        clack.select<number>({
          message: t().launchInstallHow,
          options: methods.map((candidate, index) => ({
            value: index,
            label: candidate.command,
            hint: index === 0 ? `${candidate.label}, ${t().recommended}` : candidate.label,
          })),
        }),
      );
      method = methods[picked]!;
    } else if (!(await confirm(`${t().launchInstallAsk(agent.name)} (${method.command})`, { yes: t().yes, no: t().no }))) {
      throw manual;
    }
  }

  note.info(t().launchInstalling(method.command));
  if (!(await runInstall(method, env))) throw new CliError(t().launchInstallFailed(agent.name), [`  ${agent.homepage}`]);
  const installed = locate(agent, env);
  if (!installed) throw new CliError(t().launchInstallNotFound(agent.name, agent.bin[0]!));
  note.ok(t().launchInstalled(agent.name));
  return installed;
}

/**
 * Decides which model a launch runs on: `--model` when given, a pick from the
 * list with `--pick`, otherwise the default (see `resolveDefaultModel`).
 */
async function chooseModel(
  agent: AgentDefinition,
  options: Options,
  endpoint: string,
  env: NodeJS.ProcessEnv,
): Promise<{ model: ChosenModel | undefined; models: ReturnType<typeof agentModels> }> {
  const config = await loadConfig(env);
  const catalog = await tryLoadCatalog(endpoint, env);
  const models = catalog ? agentModels(catalog.models, agent.protocol) : [];

  if (options.model) return { model: resolveNamedModel(agent, options.model, catalog), models };

  if (options.pick) {
    if (!isInteractive()) throw new CliError(t().errNeedsTerminal('--pick'));
    if (!catalog) throw new CliError(t().modelsLoadFailed(endpoint), [t().doctorHintNetwork]);
    const picked = await pickModel(agent, catalog, config, config.models?.[agent.id]);
    await updateConfig((current) => {
      if (picked) rememberModel(current, agent.id, picked.id);
      else if (current.models) delete current.models[agent.id];
    }, env);
    if (picked) note.info(t().modelRemembered(picked.id, agent.name));
    return { model: picked, models };
  }

  const model = resolveDefaultModel(agent, config, catalog);
  if (!model && agent.modelRequired) throw new CliError(t().modelNoneAvailable(agent.name), [t().doctorHintNetwork]);
  return { model, models };
}

/**
 * `omgvibe <agent> [args…]`: starts the agent on OhMyGPT for this session.
 * The agent's own config files are not touched; everything it needs arrives
 * as flags and environment variables. Resolves with the agent's exit code.
 */
export async function launch(
  agent: AgentDefinition,
  userArgs: string[],
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const { key } = await ensureKey(options, env);
  const config = await loadConfig(env);
  const { endpoint } = await resolveEndpointFor(options, config, env);
  const executable = await ensureInstalled(agent, options, env);
  const [{ model, models }, version] = await Promise.all([
    chooseModel(agent, options, endpoint.url, env),
    readVersion(agent, executable, env),
  ]);

  const scratch = new SessionScratch(env);
  try {
    const plan = await agent.launch({
      endpoint: endpoint.url,
      apiKey: key,
      model,
      models,
      version,
      userArgs,
      home: userHome(env),
      env,
      scratch,
      attribution: attributionFor(agent),
    });

    const childEnv: NodeJS.ProcessEnv = { ...env };
    for (const [name, value] of Object.entries(plan.env)) {
      if (value === undefined) delete childEnv[name];
      else childEnv[name] = value;
    }

    // One line, on stderr, and only for a person: scripts piping the agent's output see nothing extra.
    if (process.stderr.isTTY) {
      note.info(t().launchLine(agent.name, model?.id ?? t().launchNativeModel, endpointLabel(endpoint)));
    }
    try {
      return await runInteractive(executable, plan.args, childEnv);
    } catch (error) {
      throw new CliError(t().launchStartFailed(agent.name, error instanceof Error ? error.message : String(error)));
    }
  } finally {
    scratch.disposeSync();
  }
}
