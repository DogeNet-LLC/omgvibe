import * as clack from '@clack/prompts';

import { loadSetupState } from '../core/setup-state';
import { BILLING_URL, checkKey, cleanKey, KEY_ENV, KEYS_URL, keyProblem, maskKey } from '../core/account';
import { loginPage, startBrowserLogin } from '../core/browser-login';
import { DEFAULT_ENDPOINT, ENDPOINTS, fastest, probeAll, type ProbeResult, resolveEndpoint } from '../core/endpoints';
import { cmd } from '../core/invocation';
import { askForKey } from '../core/key-prompt';
import { paths, tildify } from '../core/paths';
import { BASE_URL_ENV, type Options, type ResolvedKey, resolveKey } from '../core/session';
import { loadConfig, updateConfig } from '../core/store';
import { CliError, confirm, formatInt, isInteractive, note } from '../core/ui';
import { t } from '../i18n';
import { AGENTS } from '../agents';
import { endpointLines, openUrl } from './common';
import { offerShortcut } from './shortcut';

interface LoginResult extends ResolvedKey {
  endpoint: string;
}

/** Measures the endpoints (unless one was given) and returns the one to talk to. */
async function chooseEndpoint(
  options: Options,
  env: NodeJS.ProcessEnv,
): Promise<{ url: string; results: ProbeResult[]; best: ProbeResult | null; fixed: boolean }> {
  const fixed = options.endpoint ?? env[BASE_URL_ENV];
  if (fixed) {
    let endpoint;
    try {
      endpoint = resolveEndpoint(fixed);
    } catch {
      throw new CliError(t().errBadEndpoint(fixed));
    }
    return { url: endpoint.url, results: [], best: null, fixed: true };
  }
  const results = await probeAll(ENDPOINTS, { env });
  const best = fastest(results);
  return { url: best?.endpoint.url ?? DEFAULT_ENDPOINT.url, results, best, fixed: false };
}

/**
 * Asks for a key. The first time it opens the sign-in page, where a click on Authorize sends a new key
 * back to this machine; the prompt takes a pasted key all the while, for when the browser cannot reach
 * this machine and the page shows the key instead.
 */
async function promptForKey(options: Options, env: NodeJS.ProcessEnv, again: boolean): Promise<string> {
  const fromEnv = env[KEY_ENV] ? cleanKey(env[KEY_ENV]!) : '';
  if (fromEnv) {
    clack.log.info(t().loginEnvFound(maskKey(fromEnv)));
    if (await confirm(t().loginEnvUse, { yes: t().yes, no: t().no })) return fromEnv;
  }
  // After a rejected key the sign-in page has had its turn: only the paste prompt is left.
  const listening = again || !options.browser ? null : await startBrowserLogin(loginPage(env)).catch(() => null);
  const browser = listening && openUrl(listening.url, env) ? listening : null;
  if (!browser) listening?.close();
  try {
    if (browser) clack.log.info(t().loginBrowserOpened(browser.url));
    // Without a browser here, the page is opened elsewhere and has no port to send the key to.
    else if (!again) clack.log.info(t().loginBrowserVisit(loginPage(env)));
    const key = await askForKey({
      message: browser ? t().loginBrowserWaiting : t().loginPaste,
      arrival: browser?.key,
      arrivedMessage: t().loginBrowserDone,
      validate: (typed) => {
        const problem = keyProblem(cleanKey(typed));
        if (problem === 'empty') return t().loginPasteEmpty;
        if (problem === 'whitespace') return t().loginPasteWhitespace;
        return undefined;
      },
    });
    return cleanKey(key);
  } finally {
    browser?.close();
  }
}

/**
 * Signs in: gets a key (from `--key`, the environment or a prompt), checks it
 * once against the gateway, and saves it together with the fastest endpoint.
 */
export async function login(
  options: Options,
  env: NodeJS.ProcessEnv = process.env,
  /** True when called from inside another flow (the menu, a launch) that has its own opening and closing lines. */
  embedded = false,
): Promise<LoginResult> {
  const interactive = isInteractive() && !options.yes;
  const given = options.key ? cleanKey(options.key) : !interactive && env[KEY_ENV] ? cleanKey(env[KEY_ENV]!) : '';
  if (!given && !interactive) {
    throw new CliError(t().errNeedsTerminal(cmd('login')), [t().errNotSignedInHint]);
  }
  if (interactive) {
    if (embedded) clack.log.step(t().loginIntro);
    else clack.intro(t().loginIntro);
  }

  // Measuring first means the key is checked over the route the agents will use.
  const spinner = interactive ? clack.spinner() : null;
  spinner?.start(t().endpointMeasuring);
  const endpoint = await chooseEndpoint(options, env);
  spinner?.stop(t().endpointMeasured);
  if (interactive && endpoint.results.length > 0) {
    if (endpoint.best) clack.log.message(endpointLines(endpoint.results, endpoint.best).join('\n'));
    else clack.log.warn(`${t().endpointNoneReachable} ${t().endpointUsingDefault(endpoint.url)}`);
  }

  let key = given;
  for (let attempt = 0; ; attempt += 1) {
    if (!key) key = await promptForKey(options, env, attempt > 0);
    spinner?.start(t().loginChecking);
    const check = await checkKey(endpoint.url, key, env);
    if (check.ok) {
      spinner?.stop(t().loginAccepted(check.account.userId, formatInt(check.account.rpm)));
      await save(key, endpoint, env);
      const saved = t().loginSaved(tildify(paths(env).config, env));
      if (interactive) {
        clack.log.success(saved);
        if (!check.account.toppedUp) clack.log.warn(t().loginNotToppedUp(BILLING_URL));
        if (!embedded) {
          // A first sign-in through npx is the moment to offer the installed, shorter command.
          const program = (await offerShortcut(env)) ?? undefined;
          clack.outro(`${t().loginDone} ${t().loginNext(cmd('claude', program))}`);
        }
      } else {
        process.stdout.write(`${t().loginAccepted(check.account.userId, formatInt(check.account.rpm))}\n${saved}\n`);
        if (!check.account.toppedUp) note.warn(t().loginNotToppedUp(BILLING_URL));
      }
      return { key, source: 'saved', endpoint: endpoint.url };
    }

    if (check.reason === 'unreachable') {
      spinner?.stop(t().loginUnverified(check.message));
      // The key may be fine; the network is not. Saving it is the user's call.
      if (interactive && !(await confirm(t().loginSaveUnverified, { yes: t().yes, no: t().no }, false))) {
        throw new CliError(t().loginUnverified(check.message), [t().doctorHintNetwork]);
      }
      if (!interactive) throw new CliError(t().loginUnverified(check.message), [t().doctorHintNetwork]);
      await save(key, endpoint, env);
      if (embedded) clack.log.success(t().loginSaved(tildify(paths(env).config, env)));
      else clack.outro(t().loginSaved(tildify(paths(env).config, env)));
      return { key, source: 'saved', endpoint: endpoint.url };
    }

    if (check.reason === 'throttled') {
      spinner?.stop(t().loginThrottled);
      throw new CliError(t().loginThrottled);
    }

    spinner?.stop(t().loginRejected(check.message));
    // The gateway locks out after a handful of bad keys; do not let a typo loop run into that.
    if (!interactive || attempt >= 2) {
      throw new CliError(t().loginRejected(check.message), [t().loginRejectedHint(KEYS_URL)]);
    }
    clack.log.info(t().loginRejectedHint(KEYS_URL));
    key = '';
  }
}

async function save(
  key: string,
  endpoint: { url: string; best: ProbeResult | null; fixed: boolean },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await updateConfig((config) => {
    config.apiKey = key;
    // An endpoint given for this run is not a standing choice; a measured one is.
    if (!endpoint.fixed && endpoint.best && !config.endpointPinned) {
      config.endpoint = endpoint.best.endpoint.url;
      config.endpointProbedAt = Date.now();
    }
  }, env);
}

/** The key to use, signing in first when there is none and a terminal to ask in. */
export async function ensureKey(options: Options, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedKey> {
  const resolved = resolveKey(options, await loadConfig(env), env);
  if (resolved) return resolved;
  if (!isInteractive() || options.yes) throw new CliError(t().errNotSignedIn, [t().errNotSignedInHint]);
  return login(options, env, true);
}

export async function logout(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadConfig(env);
  if (!config.apiKey) {
    process.stdout.write(`${t().logoutNothing}\n`);
  } else {
    await updateConfig((current) => {
      delete current.apiKey;
    }, env);
    process.stdout.write(`${t().logoutDone}\n`);
  }
  if (env[KEY_ENV]) process.stdout.write(`${t().logoutEnvStill}\n`);
  const state = await loadSetupState(env);
  const configured = AGENTS.filter((agent) => state.agents[agent.id]).map((agent) => agent.name);
  if (configured.length > 0) process.stdout.write(`${t().logoutSetupStill(configured.join(', '))}\n`);
}
