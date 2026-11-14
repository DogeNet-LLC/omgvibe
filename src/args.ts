import type { Options } from './core/session';

/**
 * Command-line parsing.
 *
 * omgvibe's own options are read from the start of the argument list and,
 * for an agent launch, parsing stops at the first argument that is not one of
 * them: from there on everything belongs to the agent. `--` ends omgvibe's
 * options explicitly, for an agent argument that shares a name with one.
 */

export class UsageError extends Error {
  constructor(
    readonly kind: 'needs-value' | 'unknown-option',
    readonly option: string,
  ) {
    super(`${kind}: ${option}`);
    this.name = 'UsageError';
  }
}

export interface ParsedArgs {
  /** First positional argument: a command or an agent name. Absent for a bare `omgvibe`. */
  command?: string;
  options: Options;
  lang?: string;
  help: boolean;
  version: boolean;
  /** Arguments that follow the command and are not omgvibe options. */
  rest: string[];
}

interface Flag {
  name: keyof Options | 'lang' | 'help' | 'version';
  /** Takes a value (`--model x` or `--model=x`). */
  value: boolean;
  /** The boolean a value-less flag sets; defaults to true. */
  set?: boolean;
  /**
   * Still omgvibe's after an agent's name. Kept to the options a launch
   * needs, so that `omgvibe claude --help` or `-v` reach the agent.
   */
  launch?: boolean;
}

const FLAGS: Record<string, Flag> = {
  '--model': { name: 'model', value: true, launch: true },
  '-m': { name: 'model', value: true, launch: true },
  '--pick': { name: 'pick', value: false, launch: true },
  '--endpoint': { name: 'endpoint', value: true, launch: true },
  '--key': { name: 'key', value: true, launch: true },
  '--lang': { name: 'lang', value: true, launch: true },
  '--yes': { name: 'yes', value: false, launch: true },
  '--install': { name: 'install', value: false, launch: true },
  '-y': { name: 'yes', value: false },
  '--json': { name: 'json', value: false },
  '--no-browser': { name: 'browser', value: false, set: false },
  '--refresh': { name: 'refresh', value: false },
  '--all': { name: 'all', value: false },
  '--help': { name: 'help', value: false },
  '-h': { name: 'help', value: false },
  '--version': { name: 'version', value: false },
  '-v': { name: 'version', value: false },
};

export const defaultOptions = (): Options => ({
  pick: false,
  yes: false,
  json: false,
  install: false,
  browser: true,
  refresh: false,
  all: false,
});

/**
 * @param argv arguments after the program name
 * @param isAgent tells whether a command name is an agent; an agent's
 *   arguments are passed through instead of being checked against omgvibe's
 */
export function parseArgs(argv: readonly string[], isAgent: (command: string) => boolean): ParsedArgs {
  const parsed: ParsedArgs = { options: defaultOptions(), help: false, version: false, rest: [] };
  let passthrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (passthrough) {
      parsed.rest.push(arg);
      continue;
    }
    if (arg === '--') {
      // Without a command there is nothing to pass arguments to.
      if (parsed.command === undefined) throw new UsageError('unknown-option', arg);
      passthrough = true;
      continue;
    }

    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = equals === -1 ? arg : arg.slice(0, equals);
    const agentArgs = parsed.command !== undefined && isAgent(parsed.command);
    const known = FLAGS[name];
    const flag = known && (!agentArgs || known.launch) ? known : undefined;

    if (flag) {
      let value: string | undefined;
      if (flag.value) {
        value = equals === -1 ? argv[(index += 1)] : arg.slice(equals + 1);
        if (value === undefined || value === '') throw new UsageError('needs-value', name);
      } else if (equals !== -1) {
        throw new UsageError('unknown-option', arg);
      }
      if (flag.name === 'help') parsed.help = true;
      else if (flag.name === 'version') parsed.version = true;
      else if (flag.name === 'lang') parsed.lang = value;
      else if (flag.value) (parsed.options[flag.name] as string | undefined) = value;
      else (parsed.options[flag.name] as boolean) = flag.set ?? true;
      continue;
    }

    if (parsed.command === undefined) {
      if (arg.startsWith('-')) throw new UsageError('unknown-option', arg);
      parsed.command = arg;
      continue;
    }

    // The first argument omgvibe does not own. For an agent it and everything
    // after it go to the agent; for omgvibe's own commands a stray option is a mistake.
    if (agentArgs) {
      passthrough = true;
      parsed.rest.push(arg);
    } else if (arg.startsWith('-')) {
      throw new UsageError('unknown-option', arg);
    } else {
      parsed.rest.push(arg);
    }
  }
  return parsed;
}
