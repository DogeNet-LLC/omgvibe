import { describe, expect, it } from 'vitest';

import { parseArgs, UsageError } from '../src/args';

const AGENTS = new Set(['claude', 'codex']);
const parse = (...argv: string[]) => parseArgs(argv, (name) => AGENTS.has(name));

describe('parseArgs', () => {
  it('reads a bare invocation, global flags and a command', () => {
    expect(parse()).toMatchObject({ help: false, rest: [] });
    expect(parse().command).toBeUndefined();
    expect(parse('--help')).toMatchObject({ help: true });
    expect(parse('-v')).toMatchObject({ version: true });
    expect(parse('--lang', 'zh', 'status', '--json')).toMatchObject({ command: 'status', lang: 'zh', options: { json: true } });
    expect(parse('models', 'claude', 'sonnet', '--all')).toMatchObject({ command: 'models', rest: ['claude', 'sonnet'], options: { all: true } });
    expect(parse('login', '--no-browser', '--key=sk-1')).toMatchObject({ options: { browser: false, key: 'sk-1' } });
  });

  it("takes omgvibe's options after an agent, then hands everything else to the agent", () => {
    expect(parse('codex', '--model', 'openai/gpt-5.5', 'exec', '--model', 'x', 'fix it')).toMatchObject({
      command: 'codex',
      options: { model: 'openai/gpt-5.5' },
      rest: ['exec', '--model', 'x', 'fix it'],
    });
    expect(parse('claude', '-m', 'zhipu/glm-5.3', '--pick', '-p', 'hi')).toMatchObject({
      options: { model: 'zhipu/glm-5.3', pick: true },
      rest: ['-p', 'hi'],
    });
  });

  it('leaves flags that mean something to the agent alone', () => {
    // --help, --version, -y, --json are not launch options: they belong to the agent here.
    expect(parse('claude', '--help')).toMatchObject({ help: false, rest: ['--help'] });
    expect(parse('claude', '-v')).toMatchObject({ version: false, rest: ['-v'] });
    expect(parse('claude', '-y', '--json')).toMatchObject({ options: { yes: false, json: false }, rest: ['-y', '--json'] });
    // …but before the agent's name they are omgvibe's.
    expect(parse('--yes', 'claude')).toMatchObject({ options: { yes: true }, rest: [] });
  });

  it('passes everything after -- through, even an option omgvibe has', () => {
    const escaped = parse('claude', '--', '--model', 'opus', '-p', 'x');
    expect(escaped.rest).toEqual(['--model', 'opus', '-p', 'x']);
    expect(escaped.options.model).toBeUndefined();
    expect(parse('claude', '--model', 'a/b', '--', '--model', 'opus')).toMatchObject({ options: { model: 'a/b' }, rest: ['--model', 'opus'] });
  });

  it('reports a missing value and an unknown option', () => {
    expect(() => parse('claude', '--model')).toThrow(UsageError);
    expect(() => parse('--model=')).toThrow(/needs-value/);
    expect(() => parse('--nope')).toThrow(/unknown-option/);
    expect(() => parse('status', '--nope')).toThrow(/unknown-option/);
    expect(() => parse('--')).toThrow(/unknown-option/);
    expect(() => parse('status', '--json=1')).toThrow(/unknown-option/);
  });
});
