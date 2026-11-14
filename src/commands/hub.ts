import * as clack from '@clack/prompts';

import { AGENTS, detectAll } from '../agents';
import type { AgentDefinition } from '../agents/types';
import { maskKey } from '../core/account';
import { type Options, resolveEndpointFor, resolveKey, tryLoadCatalog } from '../core/session';
import { type Lang, loadConfig, rememberModel, updateConfig } from '../core/store';
import { ask, bold, Cancelled, dim } from '../core/ui';
import { VERSION } from '../core/version';
import { LANGS, LANGUAGE_NAMES, setLang, t } from '../i18n';
import { pickModel } from './common';
import { doctorCommand } from './doctor';
import { endpointCommand } from './endpoint';
import { launch } from './launch';
import { login, logout } from './login';
import { modelsCommand } from './models';
import { resetCommand, setupCommand } from './setup';
import { statusCommand } from './status';

type Action = 'launch' | 'setup' | 'reset' | 'models' | 'status' | 'settings' | 'exit';
type Setting = 'endpoint' | 'language' | 'key' | 'logout' | 'back';

/** Runs a step of the menu; backing out of it returns to the menu instead of quitting. */
async function step(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof Cancelled)) throw error;
  }
}

async function chooseAgent(env: NodeJS.ProcessEnv): Promise<AgentDefinition> {
  const detected = await detectAll(env);
  // Installed agents first, each group in the registry's order.
  const ordered = [...detected.filter((entry) => entry.path), ...detected.filter((entry) => !entry.path)];
  const id = await ask(
    clack.select<string>({
      message: t().hubWhichAgent,
      options: ordered.map(({ agent, path, version }) => ({
        value: agent.id,
        label: agent.name,
        hint: path ? (version ?? '') : t().notInstalled,
      })),
    }),
  );
  return AGENTS.find((agent) => agent.id === id)!;
}

async function settings(options: Options, env: NodeJS.ProcessEnv): Promise<void> {
  const choice = await ask(
    clack.select<Setting>({
      message: t().hubSettings,
      options: [
        { value: 'endpoint', label: t().hubSettingsEndpoint },
        { value: 'language', label: t().hubSettingsLanguage },
        { value: 'key', label: t().hubSettingsKey },
        { value: 'logout', label: t().hubSettingsLogout },
        { value: 'back', label: t().hubBack },
      ],
    }),
  );
  if (choice === 'endpoint') await endpointCommand([], options, env);
  else if (choice === 'key') await login({ ...options, key: undefined }, env, true);
  else if (choice === 'logout') await logout(env);
  else if (choice === 'language') {
    const config = await loadConfig(env);
    const picked = await ask(
      clack.select<Lang>({
        message: t().hubLanguage,
        initialValue: config.lang,
        options: LANGS.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] })),
      }),
    );
    await updateConfig((current) => {
      current.lang = picked;
    }, env);
    setLang(picked);
    clack.log.success(t().hubLanguageSet);
  }
}

/**
 * The menu behind a bare `omgvibe`. It signs the user in on first run, then
 * offers everything the commands do. Resolves with the exit code to finish
 * with (an agent's, when one was started).
 */
export async function hub(options: Options, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  clack.intro(`${bold('omgvibe')} ${VERSION}  ${dim(t().tagline)}`);
  const config = await loadConfig(env);
  let key = resolveKey(options, config, env);
  if (!key) key = await login(options, env, true);
  else clack.log.info(dim(t().hubSignedInAs(maskKey(key.key))));

  for (;;) {
    let action: Action;
    try {
      action = await ask(
        clack.select<Action>({
          message: t().hubWhat,
          options: [
            { value: 'launch', label: t().hubLaunch, hint: t().hubLaunchHint },
            { value: 'setup', label: t().hubSetup, hint: t().hubSetupHint },
            { value: 'reset', label: t().hubReset },
            { value: 'models', label: t().hubModels },
            { value: 'status', label: t().hubStatus },
            { value: 'settings', label: t().hubSettings, hint: t().hubSettingsHint },
            { value: 'exit', label: t().hubExit },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof Cancelled) return 0;
      throw error;
    }

    if (action === 'exit') return 0;

    if (action === 'launch') {
      let started: number | undefined;
      await step(async () => {
        const agent = await chooseAgent(env);
        const current = await loadConfig(env);
        const { endpoint } = await resolveEndpointFor(options, current, env);
        const catalog = await tryLoadCatalog(endpoint.url, env);
        let model: string | undefined;
        if (catalog) {
          const picked = await pickModel(agent, catalog, current, current.models?.[agent.id]);
          model = picked?.id;
          await updateConfig((latest) => {
            if (picked) rememberModel(latest, agent.id, picked.id);
            else if (latest.models) delete latest.models[agent.id];
          }, env);
        }
        clack.outro(dim(t().hubTip(`omgvibe ${agent.id}`)));
        started = await launch(agent, [], { ...options, model, pick: false }, env);
      });
      if (started !== undefined) return started;
      continue;
    }

    await step(async () => {
      if (action === 'setup') await setupCommand([], options, env);
      else if (action === 'reset') await resetCommand([], options, env);
      else if (action === 'models') await modelsCommand([], options, env);
      else if (action === 'settings') await settings(options, env);
      else if (action === 'status') {
        await statusCommand(options, env);
        process.stdout.write('\n');
        // A failed check is reported on screen; it should not end the menu.
        await doctorCommand(options, env).catch((error: unknown) => {
          if (error instanceof Cancelled) throw error;
        });
      }
    });
  }
}
