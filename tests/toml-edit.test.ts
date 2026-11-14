import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { removeTable, removeTopLevel, renderValue, setTable, setTopLevel } from '../src/core/toml-edit';

describe('setTopLevel', () => {
  it('replaces an existing key in place and keeps its neighbours and comments', () => {
    const text = ['# my settings', 'model = "gpt-5.5"', 'approval_policy = "on-request"  # keep', '', '[mcp]', 'x = 1', ''].join('\n');
    expect(setTopLevel(text, 'model', 'zhipu/glm-5.3')).toBe(
      ['# my settings', 'model = "zhipu/glm-5.3"', 'approval_policy = "on-request"  # keep', '', '[mcp]', 'x = 1', ''].join('\n'),
    );
  });

  it('adds a new key after the last top-level key, before the first table', () => {
    const text = ['model = "a"', '', '[table]', 'model_provider = "inside the table"', ''].join('\n');
    const result = setTopLevel(text, 'model_provider', 'ohmygpt');
    expect(result).toBe(['model = "a"', 'model_provider = "ohmygpt"', '', '[table]', 'model_provider = "inside the table"', ''].join('\n'));
    expect(parse(result)).toMatchObject({ model_provider: 'ohmygpt', table: { model_provider: 'inside the table' } });
  });

  it('puts the key first when the file only has tables, and handles an empty file', () => {
    expect(setTopLevel('[a]\nb = 1\n', 'model', 'x')).toBe('model = "x"\n\n[a]\nb = 1\n');
    expect(setTopLevel('', 'model', 'x')).toBe('model = "x"\n');
  });

  it('is not fooled by a multi-line array or string that contains table-like or key-like lines', () => {
    const text = ['notify = [', '  ["nested"]', ']', 'banner = """', '[not.a.table]', 'model = "inside a string"', '"""', 'model = "real"', '', '[t]', 'k = 1', ''].join('\n');
    const result = setTopLevel(text, 'model', 'changed');
    const parsed = parse(result) as Record<string, unknown>;
    expect(parsed.model).toBe('changed');
    expect(parsed.banner).toBe('[not.a.table]\nmodel = "inside a string"\n');
    expect(parsed.notify).toEqual([['nested']]);
  });

  it('replaces a value that spans several lines', () => {
    const text = ['list = [', '  1,', '  2,', ']', 'other = true', ''].join('\n');
    expect(setTopLevel(text, 'list', 'now a string')).toBe('list = "now a string"\nother = true\n');
  });

  it('keeps CRLF line endings', () => {
    expect(setTopLevel('a = 1\r\nb = 2\r\n', 'b', 3)).toBe('a = 1\r\nb = 3\r\n');
  });
});

describe('removeTopLevel', () => {
  it('removes only the top-level key', () => {
    const text = ['model = "a"', 'model_provider = "x"', '', '[t]', 'model_provider = "keep"', ''].join('\n');
    expect(removeTopLevel(text, 'model_provider')).toBe(['model = "a"', '', '[t]', 'model_provider = "keep"', ''].join('\n'));
  });

  it('returns the text unchanged when the key is absent', () => {
    expect(removeTopLevel('a = 1\n', 'missing')).toBe('a = 1\n');
  });
});

describe('setTable / removeTable', () => {
  const entries = { name: 'OhMyGPT', base_url: 'https://api.ohmygpt.com/v1', headers: { 'X-Title': 'Codex' } };

  it('appends a new table, separated by a blank line', () => {
    const result = setTable('model = "a"\n', ['model_providers', 'ohmygpt'], entries);
    expect(result).toBe(
      ['model = "a"', '', '[model_providers.ohmygpt]', 'name = "OhMyGPT"', 'base_url = "https://api.ohmygpt.com/v1"', 'headers = { X-Title = "Codex" }', ''].join('\n'),
    );
    expect(parse(result)).toMatchObject({ model_providers: { ohmygpt: entries } });
  });

  it('replaces an existing table and its sub-tables where they stood, leaving other tables and their comments', () => {
    const text = [
      '[model_providers.ohmygpt]',
      'name = "old"',
      '',
      '[model_providers.ohmygpt.http_headers]',
      'a = "b"',
      '',
      '# the other provider',
      '[model_providers.other]',
      'name = "other"',
      '',
    ].join('\n');
    const result = setTable(text, ['model_providers', 'ohmygpt'], { name: 'new' });
    expect(result).toBe(['[model_providers.ohmygpt]', 'name = "new"', '', '# the other provider', '[model_providers.other]', 'name = "other"', ''].join('\n'));
  });

  it('removes a table without disturbing what surrounds it', () => {
    const text = ['a = 1', '', '[keep.one]', 'x = 1', '', '[drop]', 'y = 2', '', '[keep.two]', 'z = 3', ''].join('\n');
    expect(removeTable(text, ['drop'])).toBe(['a = 1', '', '[keep.one]', 'x = 1', '', '[keep.two]', 'z = 3', ''].join('\n'));
    expect(removeTable(text, ['absent'])).toBe(text);
  });

  it('removes a table at the end of the file and trims the gap it leaves', () => {
    expect(removeTable('a = 1\n\n[drop]\ny = 2\n', ['drop'])).toBe('a = 1\n');
  });

  it('matches quoted and spaced table headers', () => {
    const text = '[ model_providers . "ohmygpt" ]\nname = "old"\n';
    expect(setTable(text, ['model_providers', 'ohmygpt'], { name: 'new' })).toBe('[model_providers.ohmygpt]\nname = "new"\n');
  });
});

describe('renderValue', () => {
  it('escapes strings and quotes keys that are not bare', () => {
    expect(renderValue('a "quoted" \\ value\nline')).toBe('"a \\"quoted\\" \\\\ value\\nline"');
    expect(renderValue({ 'needs quoting': 1, bare_key: [true, 'x'] })).toBe('{ "needs quoting" = 1, bare_key = [true, "x"] }');
    expect(parse(`v = ${renderValue({ 'a.b': { c: 'd' } })}`)).toEqual({ v: { 'a.b': { c: 'd' } } });
  });
});
