import { applyEdits, modify, parse as parseJsonc, type ParseError, printParseErrorCode } from 'jsonc-parser';

import {
  parseToml,
  removeTable,
  removeTopLevel,
  setTable,
  setTopLevel,
  TomlEditError,
  type TomlScalar,
  type TomlValue,
} from './toml-edit';

/**
 * `setup` never rewrites an agent's config file. It applies a short list of
 * edits — set this JSON path, set this TOML key, replace this TOML table — and
 * records what each one replaced. `reset` plays the record backwards, and only
 * where the value is still the one omgvibe wrote: anything the user changed
 * afterwards is theirs and stays.
 */

export type Format = 'json' | 'toml';
export type JsonPath = Array<string | number>;

export type EditOp =
  /** `ifAbsent` leaves an existing value alone (used for housekeeping keys such as `$schema`). */
  | { kind: 'json-set'; path: JsonPath; value: unknown; ifAbsent?: boolean }
  | { kind: 'toml-set'; key: string; value: TomlScalar }
  | { kind: 'toml-table'; table: string[]; entries: Record<string, TomlValue> };

/** What an edit replaced: nothing, or a value. */
export type Previous = { exists: false } | { exists: true; value: unknown };

export type UndoOp =
  | { kind: 'json-set'; path: JsonPath; written: unknown; previous: Previous; createdParents: JsonPath[] }
  | { kind: 'toml-set'; key: string; written: TomlScalar; previous: Previous }
  | { kind: 'toml-table'; table: string[]; written: Record<string, TomlValue>; previous: Previous };

export class ConfigEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigEditError';
  }
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function lookup(root: unknown, path: ReadonlyArray<string | number>): Previous {
  let node: unknown = root;
  for (const part of path) {
    if (Array.isArray(node) && typeof part === 'number' && part < node.length) node = node[part];
    else if (isObject(node) && Object.prototype.hasOwnProperty.call(node, part)) node = node[String(part)];
    else return { exists: false };
  }
  return { exists: true, value: node };
}

/** A structural copy of `root` with the value at `path` removed; used to compare "everything else". */
function without(root: unknown, path: ReadonlyArray<string | number>): unknown {
  if (path.length === 0 || !isObject(root)) return root;
  const [head, ...rest] = path;
  const key = String(head);
  if (!Object.prototype.hasOwnProperty.call(root, key)) return root;
  const copy: Record<string, unknown> = { ...root };
  if (rest.length === 0) {
    delete copy[key];
    return copy;
  }
  copy[key] = without(copy[key], rest);
  // An emptied parent counts the same as an absent one for this comparison.
  if (isObject(copy[key]) && Object.keys(copy[key]).length === 0) delete copy[key];
  return copy;
}

const describePath = (path: ReadonlyArray<string | number>): string => path.join('.');

// ---------------------------------------------------------------------------
// JSON (comments and trailing commas tolerated, formatting preserved)
// ---------------------------------------------------------------------------

function parseJsonDocument(text: string): Record<string, unknown> {
  if (text.trim() === '') return {};
  const errors: ParseError[] = [];
  const value: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new ConfigEditError(`not valid JSON (${printParseErrorCode(errors[0]!.error)} at offset ${errors[0]!.offset})`);
  }
  if (!isObject(value)) throw new ConfigEditError('not a JSON object at the top level');
  return value;
}

/** Matches new nodes to the file's own indentation. */
function jsonFormatting(text: string): { insertSpaces: boolean; tabSize: number; eol: string } {
  const indent = /^([ \t]+)\S/m.exec(text)?.[1];
  return {
    insertSpaces: indent ? !indent.includes('\t') : true,
    tabSize: indent && !indent.includes('\t') ? indent.length : 2,
    eol: text.includes('\r\n') ? '\r\n' : '\n',
  };
}

function jsonModify(text: string, path: JsonPath, value: unknown): string {
  const source = text.trim() === '' ? '{}\n' : text;
  return applyEdits(source, modify(source, path, value, { formattingOptions: jsonFormatting(source) }));
}

function applyJson(text: string, ops: EditOp[]): { text: string; undo: UndoOp[] } {
  const before = parseJsonDocument(text);
  let current = text;
  const undo: UndoOp[] = [];
  for (const op of ops) {
    if (op.kind !== 'json-set') throw new ConfigEditError(`A ${op.kind} edit cannot be applied to a JSON file.`);
    const root = parseJsonDocument(current);
    const previous = lookup(root, op.path);
    if (op.ifAbsent && previous.exists) continue;
    const createdParents: JsonPath[] = [];
    for (let length = 1; length < op.path.length; length += 1) {
      const parent = op.path.slice(0, length);
      const found = lookup(root, parent);
      if (!found.exists) createdParents.push(parent);
      else if (!isObject(found.value)) {
        throw new ConfigEditError(`\`${describePath(parent)}\` is not an object, so \`${describePath(op.path)}\` cannot be set.`);
      }
    }
    current = jsonModify(current, op.path, op.value);
    undo.push({ kind: 'json-set', path: op.path, written: op.value, previous, createdParents });
  }

  // Verify: every value landed, and nothing else moved.
  const after = parseJsonDocument(current);
  let expectedRest: unknown = before;
  let actualRest: unknown = after;
  for (const op of undo) {
    if (op.kind !== 'json-set') continue;
    const landed = lookup(after, op.path);
    if (!landed.exists || !deepEqual(landed.value, op.written)) {
      throw new ConfigEditError(`could not set \`${describePath(op.path)}\``);
    }
    expectedRest = without(expectedRest, op.path);
    actualRest = without(actualRest, op.path);
  }
  if (!deepEqual(expectedRest, actualRest)) throw new ConfigEditError('the edit would have changed unrelated settings');
  return { text: current, undo };
}

function revertJson(text: string, undo: UndoOp[]): RevertResult {
  let current = text;
  const result: RevertResult = { text, reverted: [], kept: [] };
  // Last written, first undone.
  for (const op of [...undo].reverse()) {
    if (op.kind !== 'json-set') continue;
    const label = describePath(op.path);
    const now = lookup(parseJsonDocument(current), op.path);
    if (!now.exists) continue; // already gone: nothing to undo
    if (!deepEqual(now.value, op.written)) {
      result.kept.push(label);
      continue;
    }
    current = jsonModify(current, op.path, op.previous.exists ? op.previous.value : undefined);
    // Drop the objects this edit had to create, once they are empty again.
    for (const parent of [...op.createdParents].reverse()) {
      const node = lookup(parseJsonDocument(current), parent);
      if (node.exists && isObject(node.value) && Object.keys(node.value).length === 0) {
        current = jsonModify(current, parent, undefined);
      }
    }
    result.reverted.push(label);
  }
  result.text = current;
  return result;
}

// ---------------------------------------------------------------------------
// TOML
// ---------------------------------------------------------------------------

function applyToml(text: string, ops: EditOp[]): { text: string; undo: UndoOp[] } {
  const before = parseToml(text);
  let current = text;
  const undo: UndoOp[] = [];
  for (const op of ops) {
    const root = parseToml(current);
    if (op.kind === 'toml-set') {
      undo.push({ kind: 'toml-set', key: op.key, written: op.value, previous: lookup(root, [op.key]) });
      current = setTopLevel(current, op.key, op.value);
    } else if (op.kind === 'toml-table') {
      undo.push({ kind: 'toml-table', table: op.table, written: op.entries, previous: lookup(root, op.table) });
      current = setTable(current, op.table, op.entries);
    } else {
      throw new ConfigEditError(`A ${op.kind} edit cannot be applied to a TOML file.`);
    }
  }

  let after: Record<string, unknown>;
  try {
    after = parseToml(current);
  } catch (error) {
    // The usual cause: the same table is already defined inline or with dotted keys.
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigEditError(`the edited file would not parse: ${detail}`);
  }
  let expectedRest: unknown = before;
  let actualRest: unknown = after;
  for (const op of ops) {
    const path = op.kind === 'toml-set' ? [op.key] : op.kind === 'toml-table' ? op.table : [];
    const want = op.kind === 'toml-set' ? op.value : op.kind === 'toml-table' ? op.entries : undefined;
    const landed = lookup(after, path);
    if (!landed.exists || !deepEqual(landed.value, want)) {
      throw new ConfigEditError(`could not set \`${describePath(path)}\``);
    }
    expectedRest = without(expectedRest, path);
    actualRest = without(actualRest, path);
  }
  if (!deepEqual(expectedRest, actualRest)) throw new ConfigEditError('the edit would have changed unrelated settings');
  return { text: current, undo };
}

function revertToml(text: string, undo: UndoOp[]): RevertResult {
  let current = text;
  const result: RevertResult = { text, reverted: [], kept: [] };
  for (const op of [...undo].reverse()) {
    if (op.kind === 'json-set') continue;
    const path = op.kind === 'toml-set' ? [op.key] : op.table;
    const label = describePath(path);
    const now = lookup(parseToml(current), path);
    if (!now.exists) continue;
    if (!deepEqual(now.value, op.written)) {
      result.kept.push(label);
      continue;
    }
    if (op.kind === 'toml-set') {
      current = op.previous.exists
        ? setTopLevel(current, op.key, op.previous.value as TomlScalar)
        : removeTopLevel(current, op.key);
    } else {
      current = op.previous.exists
        ? setTable(current, op.table, op.previous.value as Record<string, TomlValue>)
        : removeTable(current, op.table);
    }
    result.reverted.push(label);
  }
  parseToml(current); // never hand back a file that no longer parses
  result.text = current;
  return result;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export interface RevertResult {
  text: string;
  /** Settings put back to what they were before `setup`. */
  reverted: string[];
  /** Settings left alone because they no longer hold the value omgvibe wrote. */
  kept: string[];
}

/**
 * Applies `ops` to a config file's text (`null` for a file that does not exist
 * yet). Throws {@link ConfigEditError} and changes nothing when the file cannot
 * be parsed or the result cannot be verified.
 */
export function applyOps(format: Format, text: string | null, ops: EditOp[]): { text: string; undo: UndoOp[] } {
  try {
    return format === 'json' ? applyJson(text ?? '', ops) : applyToml(text ?? '', ops);
  } catch (error) {
    if (error instanceof TomlEditError) throw new ConfigEditError(error.message);
    throw error;
  }
}

/** Undoes a recorded set of edits wherever the written value is still in place. */
export function revertOps(format: Format, text: string, undo: UndoOp[]): RevertResult {
  try {
    return format === 'json' ? revertJson(text, undo) : revertToml(text, undo);
  } catch (error) {
    if (error instanceof TomlEditError) throw new ConfigEditError(error.message);
    throw error;
  }
}
