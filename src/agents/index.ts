import { userHome } from '../core/paths';
import { capture, findExecutable, parseVersion } from '../core/process';
import { claude } from './claude';
import { codewhale } from './codewhale';
import { codex } from './codex';
import { kilo, opencode } from './opencode';
import { pi } from './pi';
import { qwen } from './qwen';
import type { AgentDefinition } from './types';

/** Every agent omgvibe can launch, in the order menus list them. */
export const AGENTS: readonly AgentDefinition[] = [claude, codex, opencode, kilo, qwen, pi, codewhale];

/** Looks an agent up by its command name or one of its aliases. */
export function findAgent(name: string): AgentDefinition | undefined {
  const wanted = name.toLowerCase();
  return AGENTS.find((agent) => agent.id === wanted || agent.aliases?.includes(wanted));
}

export interface DetectedAgent {
  agent: AgentDefinition;
  /** Full path of the executable, or `null` when it is not installed. */
  path: string | null;
  version?: string;
}

/** Finds an agent's executable; `null` when it is not installed. */
export function locate(agent: AgentDefinition, env: NodeJS.ProcessEnv = process.env): string | null {
  return findExecutable(agent.bin, env, agent.binDirs?.(userHome(env)) ?? []);
}

/** Reads an installed agent's version. Slow agents are cut off rather than waited for. */
export async function readVersion(
  agent: AgentDefinition,
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const result = await capture(file, agent.versionArgs ?? ['--version'], { env, timeoutMs: 6000 });
  return parseVersion(`${result.stdout}\n${result.stderr}`);
}

export async function detect(agent: AgentDefinition, env: NodeJS.ProcessEnv = process.env): Promise<DetectedAgent> {
  const file = locate(agent, env);
  return { agent, path: file, version: file ? await readVersion(agent, file, env) : undefined };
}

export const detectAll = (env: NodeJS.ProcessEnv = process.env): Promise<DetectedAgent[]> =>
  Promise.all(AGENTS.map((agent) => detect(agent, env)));

export type { AgentDefinition } from './types';
