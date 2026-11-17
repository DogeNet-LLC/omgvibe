import { styleText } from 'node:util';

import * as clack from '@clack/prompts';

type Style = Parameters<typeof styleText>[0];

const colorEnabled = (stream: NodeJS.WriteStream): boolean => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(stream.isTTY);
};

const paint =
  (style: Style) =>
  (text: string, stream: NodeJS.WriteStream = process.stdout): string =>
    colorEnabled(stream) ? styleText(style, text, { validateStream: false }) : text;

export const dim = paint('dim');
export const bold = paint('bold');
export const cyan = paint('cyan');
export const green = paint('green');
export const yellow = paint('yellow');
export const red = paint('red');

/** True when omgvibe can ask questions: both ends are a terminal and prompts were not turned off. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !clack.isCI();
}

/** Thrown when the user backs out of a prompt (Esc or Ctrl+C). */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

/** Awaits a clack prompt and turns its cancel symbol into a {@link Cancelled} error. */
export async function ask<T>(prompt: Promise<T>): Promise<Exclude<T, symbol>> {
  const answer = await prompt;
  if (clack.isCancel(answer)) throw new Cancelled();
  return answer as Exclude<T, symbol>;
}

/** A yes/no question whose two answers are labelled in the active language. */
export function confirm(message: string, labels: { yes: string; no: string }, initialValue = true): Promise<boolean> {
  return ask(clack.confirm({ message, active: labels.yes, inactive: labels.no, initialValue }));
}

/** A user-facing failure: printed without a stack trace, with optional follow-up lines. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
    readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/** Diagnostics go to stderr so stdout stays clean for an agent's output or `--json`. */
export const note = {
  info: (text: string): void => void process.stderr.write(`${dim(text, process.stderr)}\n`),
  warn: (text: string): void => void process.stderr.write(`${yellow('!', process.stderr)} ${text}\n`),
  error: (text: string): void => void process.stderr.write(`${red('✗', process.stderr)} ${text}\n`),
  ok: (text: string): void => void process.stderr.write(`${green('✓', process.stderr)} ${text}\n`),
  plain: (text: string): void => void process.stderr.write(`${text}\n`),
};

// ---------------------------------------------------------------------------
// column layout
// ---------------------------------------------------------------------------

/** Terminal cells a string occupies: East Asian wide characters take two, ANSI escapes none. */
export function displayWidth(text: string): number {
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/\u001b\[[0-9;]*m/g, '');
  let width = 0;
  for (const char of plain) {
    const code = char.codePointAt(0)!;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

export const padEnd = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - displayWidth(text)));
export const padStart = (text: string, width: number): string => ' '.repeat(Math.max(0, width - displayWidth(text))) + text;

export interface Column {
  header: string;
  align?: 'left' | 'right';
}

/** Lays rows out in aligned columns; the header is dimmed and the last column is not padded. */
export function table(columns: Column[], rows: string[][], stream: NodeJS.WriteStream = process.stdout): string {
  const widths = columns.map((column, index) =>
    Math.max(displayWidth(column.header), ...rows.map((row) => displayWidth(row[index] ?? ''))),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, index) => {
        const last = index === cells.length - 1;
        if (columns[index]?.align === 'right') return padStart(cell, widths[index]!);
        return last ? cell : padEnd(cell, widths[index]!);
      })
      .join('  ')
      .trimEnd();
  return [dim(line(columns.map((column) => column.header)), stream), ...rows.map(line)].join('\n');
}

/** `1000` → `1,000`. */
export const formatInt = (value: number): string => value.toLocaleString('en-US');
