import type { Model, Protocol } from '../core/catalog';
import type { EditOp, Format } from '../core/edits';

/** How one way of installing an agent is run. */
export interface InstallMethod {
  /** Short label shown in the picker: `npm`, `Homebrew`, `Official installer`. */
  label: string;
  /** Platforms this method applies to; omitted means all. */
  platforms?: NodeJS.Platform[];
  /** The command, shown to the user verbatim before it runs. */
  command: string;
  /**
   * How the command is executed: `exec` runs `file args` directly; `shell`
   * hands the whole line to the system shell (needed for `curl … | bash`).
   */
  run: { kind: 'exec'; file: string; args: string[] } | { kind: 'shell'; shell: 'sh' | 'powershell' };
}

/** Per-session files handed to an agent; removed when it exits. */
export interface Scratch {
  /** Writes a private file (mode 0600) and returns its absolute path. */
  file(name: string, content: string): Promise<string>;
}

export interface LaunchInput {
  /** Endpoint base URL without `/v1`. */
  endpoint: string;
  apiKey: string;
  /**
   * The model to run on. Absent when the user named none and the agent can
   * choose for itself. For an ID the catalog does not list, only `id` is set.
   */
  model?: { id: string; entry?: Model };
  /** Models this agent can use, strongest first. Empty when the catalog could not be loaded. */
  models: Model[];
  /** The agent's version as it reports it, when it could be read. */
  version?: string;
  /** Everything after omgvibe's own flags, passed through untouched. */
  userArgs: string[];
  /** The user's home directory (redirected in tests). */
  home: string;
  /** The environment omgvibe itself was started with. */
  env: NodeJS.ProcessEnv;
  scratch: Scratch;
  /** Headers that name the agent on each request. */
  attribution: Record<string, string>;
}

export interface LaunchPlan {
  /** Full argument list for the agent's executable. */
  args: string[];
  /** Environment changes for the child; `undefined` removes a variable. */
  env: Record<string, string | undefined>;
}

export interface SetupInput {
  endpoint: string;
  apiKey: string;
  model?: { id: string; entry?: Model };
  models: Model[];
  version?: string;
  /** The user's home directory (redirected in tests). */
  home: string;
  env: NodeJS.ProcessEnv;
  attribution: Record<string, string>;
}

/** Edits to one config file. */
export interface FileEdit {
  path: string;
  /**
   * Other names the same config file may have (`opencode.jsonc` next to
   * `opencode.json`). When `path` does not exist but one of these does, that
   * file is edited instead.
   */
  alternatives?: string[];
  format: Format;
  ops: EditOp[];
  /** True when the file will hold the API key and must be owner-only. */
  secret?: boolean;
}

export interface AgentDefinition {
  /** The subcommand: `omgvibe <id>`. */
  id: string;
  /** Other names accepted for the subcommand. */
  aliases?: string[];
  /** Display name. */
  name: string;
  vendor: string;
  /** Executable names to look for, in order. */
  bin: string[];
  /** Extra directories the agent's own installer uses (absolute paths). */
  binDirs?: (home: string) => string[];
  /** The gateway protocol this agent speaks. */
  protocol: Protocol;
  homepage: string;
  /** Guide on docs for running this agent on OhMyGPT, when one exists. */
  docs?: string;
  install: InstallMethod[];
  /** Arguments that print the version. Defaults to `--version`. */
  versionArgs?: string[];
  /**
   * Whether a model must always be passed. Agents built around one vendor's
   * model names (Claude Code) can start without one; the rest cannot.
   */
  modelRequired: boolean;
  /** IDs tried in order when the user names no model (the first one the catalog still lists wins). */
  preferredModels: string[];
  /** Builds a session-scoped launch: flags and environment only, nothing written to the agent's own config. */
  launch(input: LaunchInput): Promise<LaunchPlan> | LaunchPlan;
  /** Edits that make the agent use OhMyGPT on its own, outside omgvibe. Absent when the agent has no stable config surface. */
  setup?(input: SetupInput): FileEdit[];
  /** Arguments for a one-shot, non-interactive prompt; used by `omgvibe doctor --agents`. */
  oneShot?(prompt: string): string[];
}
