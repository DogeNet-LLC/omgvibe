import { parse } from 'smol-toml';

/**
 * Targeted edits to a TOML file that leave everything else — comments, key
 * order, formatting — exactly as the user wrote it.
 *
 * TOML has no comment-preserving editor in JavaScript, and rewriting a user's
 * `~/.codex/config.toml` from a parsed object would drop their comments. So
 * the file is edited as text: a scanner finds where each top-level statement
 * starts and ends, and edits replace whole statements. Every edit is then
 * verified by parsing the result (see `edits.ts`), so a file this scanner
 * misreads is rejected instead of corrupted.
 */

export type TomlScalar = string | number | boolean;
export type TomlValue = TomlScalar | TomlValue[] | { [key: string]: TomlValue };

export class TomlEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TomlEditError';
  }
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function renderString(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u007f]/g, (char) => {
    switch (char) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  });
  return `"${escaped}"`;
}

export const renderKey = (key: string): string => (BARE_KEY.test(key) ? key : renderString(key));

export function renderValue(value: TomlValue): string {
  if (typeof value === 'string') return renderString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TomlEditError('Cannot write a non-finite number to TOML.');
    return String(value);
  }
  // A date read back from an existing file (smol-toml's TomlDate prints itself as TOML).
  if ((value as unknown) instanceof Date) return (value as unknown as Date).toISOString();
  if (Array.isArray(value)) return `[${value.map(renderValue).join(', ')}]`;
  const entries = Object.entries(value).map(([key, entry]) => `${renderKey(key)} = ${renderValue(entry)}`);
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
}

/** `[a."b.c"]` header and one `key = value` line per entry. */
export function renderTable(tablePath: readonly string[], entries: Record<string, TomlValue>): string[] {
  return [
    `[${tablePath.map(renderKey).join('.')}]`,
    ...Object.entries(entries).map(([key, value]) => `${renderKey(key)} = ${renderValue(value)}`),
  ];
}

// ---------------------------------------------------------------------------
// scanning
// ---------------------------------------------------------------------------

interface Statement {
  /** First and last line index (inclusive) of the statement. */
  start: number;
  end: number;
  kind: 'header' | 'keyval' | 'other';
  /** Dotted key path of a header (`[a.b]` → `['a','b']`) or of a key/value statement. */
  path?: string[];
  /** True for an array-of-tables header, `[[a.b]]`. */
  arrayTable?: boolean;
}

/**
 * Parses a dotted key (`a."b.c".d`) starting at `from`; returns the parts and
 * the index just past the key, or `null` when the text there is not a key.
 */
function readDottedKey(line: string, from: number): { path: string[]; next: number } | null {
  const path: string[] = [];
  let index = from;
  const skipSpace = (): void => {
    while (line[index] === ' ' || line[index] === '\t') index += 1;
  };
  for (;;) {
    skipSpace();
    const quote = line[index];
    if (quote === '"' || quote === "'") {
      let end = index + 1;
      let part = '';
      while (end < line.length && line[end] !== quote) {
        if (quote === '"' && line[end] === '\\' && end + 1 < line.length) {
          part += line[end + 1];
          end += 2;
        } else {
          part += line[end];
          end += 1;
        }
      }
      if (end >= line.length) return null;
      path.push(part);
      index = end + 1;
    } else {
      const match = /^[A-Za-z0-9_-]+/.exec(line.slice(index));
      if (!match) return null;
      path.push(match[0]);
      index += match[0].length;
    }
    skipSpace();
    if (line[index] !== '.') return { path, next: index };
    index += 1;
  }
}

/**
 * Splits the document into statements. Multi-line strings and multi-line
 * arrays or inline tables belong to the statement that opened them, so a line
 * that merely looks like a table header inside one of them is not mistaken
 * for a header.
 */
function scan(lines: readonly string[]): Statement[] {
  const statements: Statement[] = [];
  let depth = 0;
  let multiline: '"""' | "'''" | null = null;
  let open: Statement | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const startsStatement = depth === 0 && multiline === null;

    if (startsStatement) {
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;
      if (trimmed === '' || trimmed.startsWith('#')) {
        open = { start: lineIndex, end: lineIndex, kind: 'other' };
      } else if (trimmed.startsWith('[')) {
        const arrayTable = trimmed.startsWith('[[');
        const key = readDottedKey(line, indent + (arrayTable ? 2 : 1));
        open = { start: lineIndex, end: lineIndex, kind: 'header', path: key?.path ?? [], arrayTable };
        statements.push(open);
        // A header never spans lines; its brackets must not count as array depth.
        continue;
      } else {
        const key = readDottedKey(line, indent);
        open =
          key && line[key.next] === '='
            ? { start: lineIndex, end: lineIndex, kind: 'keyval', path: key.path }
            : { start: lineIndex, end: lineIndex, kind: 'other' };
      }
      statements.push(open);
    } else if (open) {
      open.end = lineIndex;
    }

    // Walk the line to carry string and bracket state into the next one.
    let index = 0;
    while (index < line.length) {
      if (multiline) {
        const close = line.indexOf(multiline, index);
        if (close === -1) break;
        // In a basic string a backslash escapes the quote that follows it.
        if (multiline === '"""' && line[close - 1] === '\\' && line[close - 2] !== '\\') {
          index = close + 1;
          continue;
        }
        index = close + 3;
        multiline = null;
        continue;
      }
      const char = line[index]!;
      if (char === '#') break;
      if (line.startsWith('"""', index) || line.startsWith("'''", index)) {
        multiline = line.slice(index, index + 3) as '"""' | "'''";
        index += 3;
        continue;
      }
      if (char === '"' || char === "'") {
        let end = index + 1;
        while (end < line.length && line[end] !== char) end += char === '"' && line[end] === '\\' ? 2 : 1;
        index = end + 1;
        continue;
      }
      if (char === '[' || char === '{') depth += 1;
      else if (char === ']' || char === '}') depth = Math.max(0, depth - 1);
      index += 1;
    }
  }
  return statements;
}

const samePath = (a: readonly string[] | undefined, b: readonly string[]): boolean =>
  a !== undefined && a.length === b.length && a.every((part, index) => part === b[index]);

const startsWithPath = (path: readonly string[] | undefined, prefix: readonly string[]): boolean =>
  path !== undefined && path.length >= prefix.length && prefix.every((part, index) => path[index] === part);

// ---------------------------------------------------------------------------
// document
// ---------------------------------------------------------------------------

function split(text: string): { lines: string[]; eol: string; finalNewline: boolean } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const finalNewline = text === '' || text.endsWith('\n');
  const lines = text.split(/\r?\n/);
  if (finalNewline && lines[lines.length - 1] === '') lines.pop();
  return { lines, eol, finalNewline };
}

const join = (lines: readonly string[], eol: string): string => (lines.length > 0 ? lines.join(eol) + eol : '');

/**
 * Sets a top-level `key = value`, replacing an existing statement in place or
 * adding one after the last top-level key (top-level keys must precede the
 * first table header to stay top-level).
 */
export function setTopLevel(text: string, key: string, value: TomlScalar): string {
  const { lines, eol } = split(text);
  const statements = scan(lines);
  const firstHeader = statements.findIndex((statement) => statement.kind === 'header');
  const topLevel = firstHeader === -1 ? statements : statements.slice(0, firstHeader);
  const rendered = `${renderKey(key)} = ${renderValue(value)}`;

  const existing = topLevel.find((statement) => statement.kind === 'keyval' && samePath(statement.path, [key]));
  if (existing) {
    lines.splice(existing.start, existing.end - existing.start + 1, rendered);
    return join(lines, eol);
  }

  const lastKey = topLevel.filter((statement) => statement.kind === 'keyval').pop();
  if (lastKey) {
    lines.splice(lastKey.end + 1, 0, rendered);
    return join(lines, eol);
  }

  // No top-level keys yet: put it first, set off from whatever follows.
  const needsGap = lines.length > 0 && lines[0]!.trim() !== '';
  lines.unshift(rendered, ...(needsGap ? [''] : []));
  return join(lines, eol);
}

/** Removes a top-level key; the text is returned unchanged when the key is not there. */
export function removeTopLevel(text: string, key: string): string {
  const { lines, eol } = split(text);
  const statements = scan(lines);
  const firstHeader = statements.findIndex((statement) => statement.kind === 'header');
  const topLevel = firstHeader === -1 ? statements : statements.slice(0, firstHeader);
  const existing = topLevel.find((statement) => statement.kind === 'keyval' && samePath(statement.path, [key]));
  if (!existing) return text;
  lines.splice(existing.start, existing.end - existing.start + 1);
  // Do not leave a blank line at the very top where the key used to be.
  while (existing.start === 0 && lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  return join(lines, eol);
}

/**
 * Removes the table `[a.b]` and its sub-tables (`[a.b.c]`). Returns the text
 * and the line index where the first removed block began (-1 if none).
 */
function cutTable(lines: string[], tablePath: readonly string[]): number {
  let firstCut = -1;
  for (;;) {
    const statements = scan(lines);
    const headerIndex = statements.findIndex(
      (statement) => statement.kind === 'header' && startsWithPath(statement.path, tablePath),
    );
    if (headerIndex === -1) return firstCut;
    const header = statements[headerIndex]!;
    const nextHeader = statements.slice(headerIndex + 1).find((statement) => statement.kind === 'header');
    let end = nextHeader ? nextHeader.start : lines.length;
    // Comments directly above the next header belong to it, not to this block.
    while (end > header.start + 1 && lines[end - 1]!.trim().startsWith('#')) end -= 1;
    // Blank lines after the block go with it.
    let start = header.start;
    lines.splice(start, end - start);
    // Collapse the gap the block leaves: at most one blank line between neighbours.
    while (start > 0 && start < lines.length && lines[start - 1]!.trim() === '' && lines[start]!.trim() === '') {
      lines.splice(start, 1);
    }
    while (start === lines.length && start > 0 && lines[start - 1]!.trim() === '') {
      lines.pop();
      start -= 1;
    }
    if (firstCut === -1) firstCut = start;
  }
}

/** Replaces (or adds) the table at `tablePath` with exactly `entries`. */
export function setTable(text: string, tablePath: readonly string[], entries: Record<string, TomlValue>): string {
  const { lines, eol } = split(text);
  const cutAt = cutTable(lines, tablePath);
  const block = renderTable(tablePath, entries);
  const at = cutAt === -1 ? lines.length : cutAt;
  const before = at > 0 && lines[at - 1]!.trim() !== '' ? [''] : [];
  const after = at < lines.length && lines[at]!.trim() !== '' ? [''] : [];
  lines.splice(at, 0, ...before, ...block, ...after);
  return join(lines, eol);
}

/** Removes the table at `tablePath` together with its sub-tables. */
export function removeTable(text: string, tablePath: readonly string[]): string {
  const { lines, eol } = split(text);
  if (cutTable(lines, tablePath) === -1) return text;
  return join(lines, eol);
}

/** Parses TOML, turning the parser's error into one that names the file's problem plainly. */
export function parseToml(text: string): Record<string, unknown> {
  try {
    return parse(text) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new TomlEditError(`not valid TOML (${detail})`);
  }
}
