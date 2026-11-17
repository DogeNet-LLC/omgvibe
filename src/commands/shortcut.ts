import * as clack from '@clack/prompts';

import { cmd, INVOCATION, SHORT_COMMAND } from '../core/invocation';
import { capture } from '../core/process';
import { shortcutState } from '../core/shortcut';
import { loadConfig, updateConfig } from '../core/store';
import { confirm, isInteractive, note } from '../core/ui';
import { PACKAGE_NAME } from '../core/version';
import { t } from '../i18n';

/** What `npm install -g` is given. `OMGVIBE_PACKAGE_SPEC` points it at a tarball when testing an unpublished build. */
export const packageSpec = (env: NodeJS.ProcessEnv): string => env.OMGVIBE_PACKAGE_SPEC || `${PACKAGE_NAME}@latest`;

/** The install command as the user would type it. */
export const installCommand = (env: NodeJS.ProcessEnv = process.env): string =>
  `npm install -g ${env.OMGVIBE_PACKAGE_SPEC || PACKAGE_NAME}`;

const TIP_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

const mention = (env: NodeJS.ProcessEnv): Promise<unknown> =>
  updateConfig((config) => {
    config.shortcutMentionedAt = Date.now();
  }, env).catch(() => undefined);

/** True for someone running through npx, at a terminal, with no `ov` of any kind on their PATH. */
async function couldUseShortcut(env: NodeJS.ProcessEnv): Promise<boolean> {
  return INVOCATION.npx && isInteractive() && (await shortcutState(env)).state === 'missing';
}

/**
 * Installs omgvibe globally, which is what provides `ov`. Reports the outcome
 * and resolves with the command to use from now on: `ov` when it works, the
 * long name when another program has taken the short one, `null` on failure.
 */
export async function installShortcut(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const command = installCommand(env);
  const spinner = clack.spinner();
  spinner.start(t().shortcutInstalling(command));
  const result = await capture('npm', ['install', '-g', packageSpec(env)], { timeoutMs: 180_000, env });
  if (result.code !== 0) {
    spinner.error(t().shortcutFailed(command));
    // npm refuses the whole install when a file of another program is in the way.
    if (/\bEEXIST\b/.test(result.stderr)) clack.log.warn(t().shortcutFailedExists(SHORT_COMMAND));
    else if (/\bEACCES\b|\bEPERM\b/.test(result.stderr)) clack.log.warn(t().shortcutFailedPermission);
    else if (result.stderr.trim()) clack.log.message(result.stderr.trim().split('\n').slice(-6).join('\n'));
    return null;
  }
  const after = await shortcutState(env);
  if (after.state === 'ready') {
    spinner.stop(t().shortcutReady(cmd('claude', SHORT_COMMAND)));
    return SHORT_COMMAND;
  }
  spinner.stop(t().shortcutInstalled);
  if (after.state === 'shadowed') clack.log.warn(t().shortcutShadowed(SHORT_COMMAND, after.path, PACKAGE_NAME));
  else clack.log.warn(t().shortcutNotOnPath(SHORT_COMMAND));
  return after.state === 'shadowed' ? PACKAGE_NAME : null;
}

/**
 * Asks, once, whether to install the short command. Only for someone who is
 * running through npx and has no `ov` yet. Resolves with the command to use
 * from now on when one was installed.
 */
export async function offerShortcut(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (!(await couldUseShortcut(env))) return null;
  if ((await loadConfig(env)).shortcutMentionedAt !== undefined) return null;
  await mention(env);
  clack.log.info(t().shortcutWhy(installCommand(env), cmd('claude', SHORT_COMMAND)));
  if (!(await confirm(t().shortcutAsk(SHORT_COMMAND), { yes: t().shortcutYes, no: t().shortcutNo }))) return null;
  return installShortcut(env);
}

/** True when the menu should list the install as one of its actions. */
export const shortcutAvailable = couldUseShortcut;

/** A one-line reminder after an agent session started through npx; at most once a week. */
export async function tipShortcut(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    if (!process.stderr.isTTY || !(await couldUseShortcut(env))) return;
    const last = (await loadConfig(env)).shortcutMentionedAt;
    if (last !== undefined && Date.now() - last < TIP_EVERY_MS) return;
    await mention(env);
    note.info(t().shortcutTip(installCommand(env), cmd('claude', SHORT_COMMAND)));
  } catch {
    // A tip is never worth an error.
  }
}
