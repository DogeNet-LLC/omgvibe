import * as clack from '@clack/prompts';

import { AGENTS, findAgent, locate, readVersion } from '../agents';
import type { AgentDefinition, FileEdit } from '../agents/types';
import { agentModels } from '../core/catalog';
import { cmd } from '../core/invocation';
import { tildify, userHome } from '../core/paths';
import {
  attributionFor,
  type ChosenModel,
  type Options,
  resolveDefaultModel,
  resolveEndpointFor,
  resolveNamedModel,
  tryLoadCatalog,
} from '../core/session';
import {
  applySetup,
  describeOps,
  loadSetupState,
  planFiles,
  revertSetup,
  type RevertedFile,
  SetupError,
} from '../core/setup-state';
import { loadConfig, rememberModel, updateConfig } from '../core/store';
import { ask, CliError, confirm, dim, isInteractive } from '../core/ui';
import { t } from '../i18n';
import { pickModel } from './common';
import { ensureKey } from './login';

const setupCapable = (): AgentDefinition[] => AGENTS.filter((agent) => agent.setup !== undefined);

function resolveAgents(names: readonly string[]): AgentDefinition[] {
  return names.map((name) => {
    const agent = findAgent(name);
    if (!agent) throw new CliError(t().errUnknownCommand(name), [t().errUnknownCommandHint]);
    if (!agent.setup) throw new CliError(t().setupUnsupported(agent.name));
    return agent;
  });
}

const say = (interactive: boolean, kind: 'info' | 'success' | 'warn' | 'message', text: string): void => {
  if (interactive) clack.log[kind](text);
  else process.stdout.write(`${text}\n`);
};

/**
 * `omgvibe setup [agent…]` writes OhMyGPT into each agent's own config, so the
 * agent uses it however it is started (a plain `claude`, the desktop app, an
 * IDE extension). Only the listed settings are changed; the previous values
 * are recorded for `omgvibe reset` and a copy of each file is kept.
 */
export async function setupCommand(
  names: readonly string[],
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const interactive = isInteractive() && !options.yes;
  if (names.length === 0 && !interactive) throw new CliError(t().errNeedsTerminal(cmd('setup')), [cmd('setup claude')]);
  if (interactive) clack.intro(t().setupIntro);

  const { key } = await ensureKey(options, env);
  const config = await loadConfig(env);
  const { endpoint } = await resolveEndpointFor(options, config, env);
  const catalog = await tryLoadCatalog(endpoint.url, env);
  const state = await loadSetupState(env);

  let agents = resolveAgents(names);
  if (agents.length === 0) {
    const capable = setupCapable();
    if (capable.length === 0) throw new CliError(t().setupNone);
    const picked = await ask(
      clack.multiselect<string>({
        message: t().setupWhich,
        required: false,
        initialValues: capable.filter((agent) => state.agents[agent.id]).map((agent) => agent.id),
        options: capable.map((agent) => ({
          value: agent.id,
          label: agent.name,
          hint: state.agents[agent.id] ? t().statusSetupApplied : locate(agent, env) ? '' : t().notInstalled,
        })),
      }),
    );
    agents = capable.filter((agent) => picked.includes(agent.id));
    if (agents.length === 0) {
      clack.outro(t().setupNoneSelected);
      return;
    }
  }

  // Work out every agent's edits before changing anything, so the user confirms the whole plan once.
  const plans: Array<{ agent: AgentDefinition; model: ChosenModel | undefined; edits: FileEdit[] }> = [];
  for (const agent of agents) {
    let model: ChosenModel | undefined;
    if (options.model) model = resolveNamedModel(agent, options.model, catalog);
    else if (interactive && catalog) model = await pickModel(agent, catalog, config, state.agents[agent.id]?.model ?? config.models?.[agent.id]);
    else model = resolveDefaultModel(agent, config, catalog);
    if (!model && agent.modelRequired) throw new CliError(t().modelNoneAvailable(agent.name), [t().doctorHintNetwork]);

    const file = locate(agent, env);
    const edits = agent.setup!({
      endpoint: endpoint.url,
      apiKey: key,
      model,
      models: catalog ? agentModels(catalog.models, agent.protocol) : [],
      version: file ? await readVersion(agent, file, env) : undefined,
      home: userHome(env),
      env,
      attribution: attributionFor(agent),
    });
    plans.push({ agent, model, edits });
  }

  const preview = plans
    .flatMap(({ edits }) =>
      planFiles(edits).flatMap((planned) => [
        t().setupPlanFile(tildify(planned.path, env), planned.exists ? t().setupFileEdit : t().setupFileNew),
        ...describeOps(planned.edit.ops, key).map((line) => dim(`  ${line}`)),
      ]),
    )
    .join('\n');
  if (interactive) {
    clack.note(preview, t().setupPlan);
    if (!(await confirm(t().setupConfirm, { yes: t().yes, no: t().no }))) {
      clack.outro(t().cancelled);
      return;
    }
  }

  for (const { agent, model, edits } of plans) {
    let applied;
    try {
      applied = await applySetup(agent.id, edits, { endpoint: endpoint.url, model: model?.id }, env);
    } catch (error) {
      if (!(error instanceof SetupError)) throw error;
      throw new CliError(t().setupFailed(tildify(error.file, env), error.reason), [
        t().setupFailedHint(cmd(agent.id)),
      ]);
    }
    for (const file of applied) {
      say(interactive, 'success', t().setupWrote(tildify(file.path, env)));
      if (file.backup) say(interactive, 'message', dim(t().setupBackup(tildify(file.backup, env))));
    }
    if (edits.some((edit) => edit.secret)) say(interactive, 'message', dim(t().setupKeyNote));
    say(interactive, 'info', t().setupDone(agent.name));
    if (model) await updateConfig((current) => rememberModel(current, agent.id, model.id), env);
  }

  const undo = t().setupUndoHint(cmd(agents.length === 1 ? `reset ${agents[0]!.id}` : 'reset'));
  if (interactive) clack.outro(undo);
  else process.stdout.write(`${undo}\n`);
}

function reportReverted(interactive: boolean, results: readonly RevertedFile[], env: NodeJS.ProcessEnv): boolean {
  let failed = false;
  for (const result of results) {
    const file = tildify(result.path, env);
    switch (result.outcome) {
      case 'reverted':
        say(interactive, 'success', t().resetReverted(file, result.reverted.length));
        if (result.kept.length > 0) say(interactive, 'warn', t().resetKept(result.kept.join(', ')));
        break;
      case 'removed':
        say(interactive, 'success', t().resetRemovedFile(file));
        break;
      case 'missing':
        say(interactive, 'message', dim(t().resetMissing(file)));
        break;
      case 'failed':
        failed = true;
        say(interactive, 'warn', t().resetFailed(file, result.reason));
        if (result.backup) say(interactive, 'message', dim(t().resetBackupHint(tildify(result.backup, env))));
        break;
    }
  }
  return failed;
}

/**
 * `omgvibe reset [agent…]` undoes `setup`: each setting goes back to what it
 * was, unless it has been changed since, in which case it is left alone.
 */
export async function resetCommand(
  names: readonly string[],
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const interactive = isInteractive() && !options.yes;
  const state = await loadSetupState(env);
  const applied = AGENTS.filter((agent) => state.agents[agent.id]);

  let agents = resolveAgents(names);
  if (agents.length === 0) {
    if (applied.length === 0) {
      process.stdout.write(`${t().resetNothing}\n`);
      return;
    }
    if (!interactive || applied.length === 1) {
      agents = applied;
    } else {
      clack.intro(t().resetIntro);
      const picked = await ask(
        clack.multiselect<string>({
          message: t().resetWhich,
          required: false,
          initialValues: applied.map((agent) => agent.id),
          options: applied.map((agent) => ({ value: agent.id, label: agent.name })),
        }),
      );
      agents = applied.filter((agent) => picked.includes(agent.id));
      if (agents.length === 0) {
        clack.outro(t().cancelled);
        return;
      }
    }
  }

  let failed = false;
  for (const agent of agents) {
    const results = await revertSetup(agent.id, env);
    if (results === null) {
      process.stdout.write(`${t().resetNothingFor(agent.name)}\n`);
      continue;
    }
    const agentFailed = reportReverted(false, results, env);
    failed ||= agentFailed;
    if (!agentFailed) process.stdout.write(`${t().resetDone(agent.name)}\n`);
  }
  if (failed) throw new CliError('', [], 1);
}
