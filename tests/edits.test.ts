import { describe, expect, it } from 'vitest';

import { applyOps, ConfigEditError, type EditOp, revertOps } from '../src/core/edits';

describe('JSON edits', () => {
  const ops: EditOp[] = [
    { kind: 'json-set', path: ['env', 'ANTHROPIC_BASE_URL'], value: 'https://api.ohmygpt.com' },
    { kind: 'json-set', path: ['env', 'ANTHROPIC_AUTH_TOKEN'], value: 'sk-test' },
  ];

  it('creates the file content from nothing and removes it all again on revert', () => {
    const { text, undo } = applyOps('json', null, ops);
    expect(JSON.parse(text)).toEqual({ env: { ANTHROPIC_BASE_URL: 'https://api.ohmygpt.com', ANTHROPIC_AUTH_TOKEN: 'sk-test' } });
    const reverted = revertOps('json', text, undo);
    expect(JSON.parse(reverted.text)).toEqual({});
    expect(reverted.reverted).toHaveLength(2);
  });

  it('keeps comments, trailing commas, indentation and unrelated settings', () => {
    const original = '{\n\t// mine\n\t"permissions": { "allow": ["Bash(ls)"] },\n\t"env": { "MINE": "1" },\n}\n';
    const { text, undo } = applyOps('json', original, ops);
    expect(text).toContain('// mine');
    expect(text).toContain('"permissions": { "allow": ["Bash(ls)"] }');
    expect(text).toContain('\t\t"ANTHROPIC_BASE_URL": "https://api.ohmygpt.com"');
    // The inline `env` object gets re-wrapped; apart from whitespace the original is back.
    const reverted = revertOps('json', text, undo).text;
    expect(reverted.replace(/\s+/g, '')).toBe(original.replace(/\s+/g, ''));
    expect(reverted).toContain('// mine');
  });

  it('gives back a pretty-printed file byte for byte', () => {
    const original = '{\n  // mine\n  "permissions": {\n    "allow": ["Bash(ls)"]\n  },\n  "env": {\n    "MINE": "1"\n  }\n}\n';
    const { text, undo } = applyOps('json', original, ops);
    expect(revertOps('json', text, undo).text).toBe(original);
  });

  it('restores an overwritten value, and leaves a value alone when it was changed after setup', () => {
    const original = '{\n  "model": "mine",\n  "small_model": "mine-small"\n}\n';
    const { text, undo } = applyOps('json', original, [
      { kind: 'json-set', path: ['model'], value: 'ohmygpt/x' },
      { kind: 'json-set', path: ['small_model'], value: 'ohmygpt/x' },
    ]);
    const edited = text.replace('"small_model": "ohmygpt/x"', '"small_model": "changed-by-user"');
    const result = revertOps('json', edited, undo);
    expect(JSON.parse(result.text)).toEqual({ model: 'mine', small_model: 'changed-by-user' });
    expect(result.reverted).toEqual(['model']);
    expect(result.kept).toEqual(['small_model']);
  });

  it('honours ifAbsent and does not record an edit it skipped', () => {
    const op: EditOp = { kind: 'json-set', path: ['$schema'], value: 'https://opencode.ai/config.json', ifAbsent: true };
    const kept = applyOps('json', '{ "$schema": "https://example.com/mine.json" }\n', [op]);
    expect(JSON.parse(kept.text)).toEqual({ $schema: 'https://example.com/mine.json' });
    expect(kept.undo).toHaveLength(0);
    expect(applyOps('json', '{}\n', [op]).undo).toHaveLength(1);
  });

  it('refuses a file it cannot parse, or a parent that is not an object', () => {
    expect(() => applyOps('json', '{ "env": ', ops)).toThrow(ConfigEditError);
    expect(() => applyOps('json', '[1, 2]', ops)).toThrow(/not a JSON object/);
    expect(() => applyOps('json', '{ "env": "a string" }', ops)).toThrow(/`env` is not an object/);
  });
});

describe('TOML edits', () => {
  const ops: EditOp[] = [
    { kind: 'toml-set', key: 'model', value: 'openai/gpt-5.5' },
    { kind: 'toml-set', key: 'model_provider', value: 'ohmygpt' },
    { kind: 'toml-table', table: ['model_providers', 'ohmygpt'], entries: { name: 'OhMyGPT', base_url: 'https://api.ohmygpt.com/v1' } },
  ];
  const original = ['# codex', 'model = "gpt-5.5"', 'approval_policy = "never"', '', '[mcp_servers.docs]', 'command = "npx"', ''].join('\n');

  it('round-trips: apply then revert gives back the original text', () => {
    const { text, undo } = applyOps('toml', original, ops);
    expect(text).toContain('model = "openai/gpt-5.5"');
    expect(text).toContain('[model_providers.ohmygpt]');
    expect(text).toContain('# codex');
    expect(revertOps('toml', text, undo).text).toBe(original);
  });

  it('works on a file that does not exist yet', () => {
    const { text, undo } = applyOps('toml', null, ops);
    expect(text).toBe('model = "openai/gpt-5.5"\nmodel_provider = "ohmygpt"\n\n[model_providers.ohmygpt]\nname = "OhMyGPT"\nbase_url = "https://api.ohmygpt.com/v1"\n');
    expect(revertOps('toml', text, undo).text).toBe('');
  });

  it('puts back a provider table that existed before', () => {
    const before = 'model_provider = "ohmygpt"\n\n[model_providers.ohmygpt]\nname = "mine"\nbase_url = "https://example.com/v1"\n';
    const { text, undo } = applyOps('toml', before, ops);
    const reverted = revertOps('toml', text, undo).text;
    expect(reverted).toContain('name = "mine"');
    expect(reverted).toContain('base_url = "https://example.com/v1"');
    expect(reverted).not.toContain('model = ');
  });

  it('refuses to edit when the table is already defined inline or with dotted keys', () => {
    expect(() => applyOps('toml', 'model_providers = { ohmygpt = { name = "x" } }\n', ops)).toThrow(ConfigEditError);
    expect(() => applyOps('toml', 'model_providers.ohmygpt.name = "x"\n', ops)).toThrow(ConfigEditError);
  });

  it('refuses a file that is not valid TOML', () => {
    expect(() => applyOps('toml', 'model = \n[broken', ops)).toThrow(/not valid TOML/);
  });

  it('leaves a setting alone on revert when it no longer holds what was written', () => {
    const { text, undo } = applyOps('toml', original, ops);
    const edited = text.replace('model = "openai/gpt-5.5"', 'model = "something-else"');
    const result = revertOps('toml', edited, undo);
    expect(result.kept).toEqual(['model']);
    expect(result.text).toContain('model = "something-else"');
    expect(result.text).not.toContain('[model_providers.ohmygpt]');
  });
});
