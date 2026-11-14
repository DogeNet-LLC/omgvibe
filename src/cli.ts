import { AGENTS, findAgent } from './agents';
import { parseArgs, UsageError } from './args';
import { doctorCommand } from './commands/doctor';
import { endpointCommand } from './commands/endpoint';
import { helpText } from './commands/help';
import { hub } from './commands/hub';
import { launch } from './commands/launch';
import { login, logout } from './commands/login';
import { modelsCommand } from './commands/models';
import { resetCommand, setupCommand } from './commands/setup';
import { statusCommand } from './commands/status';
import { announceUpdate, refreshUpdateInfo, updateCommand } from './commands/update';
import { sweepStaleScratch } from './core/scratch';
import { loadConfig } from './core/store';
import { Cancelled, CliError, isInteractive, note } from './core/ui';
import { VERSION } from './core/version';
import { detectLang, isLang, setLang, t } from './i18n';

const COMMANDS = ['login', 'logout', 'setup', 'reset', 'models', 'status', 'doctor', 'endpoint', 'update', 'help', 'version'];

/** The closest known command or agent name to a mistyped one, when it is close enough to be a typo. */
function closestCommand(input: string): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const above = row[j]!;
        row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length]!;
  };
  const names = [...COMMANDS, ...AGENTS.flatMap((agent) => [agent.id, ...(agent.aliases ?? [])])];
  const ranked = names.map((name) => ({ name, d: distance(input.toLowerCase(), name) })).sort((a, b) => a.d - b.d);
  return ranked[0] && ranked[0].d <= 2 ? ranked[0].name : undefined;
}

async function run(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  // Language first, so that even a usage error is reported in it.
  const config = await loadConfig(env).catch(() => ({}) as Awaited<ReturnType<typeof loadConfig>>);
  setLang(config.lang ?? detectLang(env));

  let parsed;
  try {
    parsed = parseArgs(argv, (name) => findAgent(name) !== undefined);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    throw new CliError(
      error.kind === 'needs-value' ? t().errOptionNeedsValue(error.option) : t().errUnknownOption(error.option),
      [t().errUnknownCommandHint],
      2,
    );
  }
  if (parsed.lang !== undefined) {
    if (!isLang(parsed.lang)) throw new CliError(t().errBadLang(parsed.lang), [], 2);
    setLang(parsed.lang);
  }

  const { command, options, rest } = parsed;
  if (parsed.version || command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.help || command === 'help') {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }

  // Surface a corrupt settings file now rather than as a confusing failure later.
  try {
    await loadConfig(env);
  } catch (error) {
    throw new CliError(t().errConfig(error instanceof Error ? error.message : String(error)));
  }
  sweepStaleScratch(env);

  if (command === undefined) {
    if (!isInteractive()) {
      process.stdout.write(`${helpText()}\n`);
      return 0;
    }
    refreshUpdateInfo(env);
    const code = await hub(options, env);
    await announceUpdate(env);
    return code;
  }

  const agent = findAgent(command);
  if (agent) {
    refreshUpdateInfo(env);
    const code = await launch(agent, rest, options, env);
    await announceUpdate(env);
    return code;
  }

  switch (command) {
    case 'login':
      await login(options, env);
      break;
    case 'logout':
      await logout(env);
      break;
    case 'setup':
      await setupCommand(rest, options, env);
      break;
    case 'reset':
      await resetCommand(rest, options, env);
      break;
    case 'models':
      await modelsCommand(rest, options, env);
      break;
    case 'status':
      await statusCommand(options, env);
      break;
    case 'doctor':
      await doctorCommand(options, env);
      break;
    case 'endpoint':
      await endpointCommand(rest, options, env);
      break;
    case 'update':
      await updateCommand(env);
      return 0;
    default: {
      const suggestion = closestCommand(command);
      throw new CliError(
        t().errUnknownCommand(command),
        [...(suggestion ? [t().errDidYouMean(`omgvibe ${suggestion}`)] : []), t().errUnknownCommandHint],
        2,
      );
    }
  }
  if (!options.json) await announceUpdate(env);
  return 0;
}

async function main(): Promise<void> {
  let code: number;
  try {
    code = await run(process.argv.slice(2), process.env);
  } catch (error) {
    if (error instanceof Cancelled) {
      note.plain(t().cancelled);
      code = 130;
    } else if (error instanceof CliError) {
      if (error.message) note.error(error.message);
      for (const hint of error.hints) note.info(hint);
      code = error.exitCode;
    } else {
      note.error(`${t().unknownError}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      code = 1;
    }
  }
  // Exit explicitly: a background update check must not keep the process alive.
  process.exit(code);
}

void main();
