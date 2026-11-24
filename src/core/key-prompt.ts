import type { Readable, Writable } from 'node:stream';
import { styleText } from 'node:util';

import { PasswordPrompt } from '@clack/core';
import { isCancel, S_BAR, S_BAR_END, S_PASSWORD_MASK, symbol } from '@clack/prompts';

import { Cancelled } from './ui';

export interface KeyPromptOptions {
  message: string;
  /** A reason to refuse what was typed, or nothing to accept it. */
  validate: (typed: string) => string | undefined;
  /** A key on its way from somewhere else, such as the browser. The prompt ends when it settles. */
  arrival?: Promise<string>;
  /** What the prompt turns into when `arrival` settles first. */
  arrivedMessage?: string;
  input?: Readable;
  output?: Writable;
}

/**
 * A masked prompt for a key, drawn like clack's own, that also ends when a key arrives another way.
 * Resolves with whichever came first: the typed text or the arrived key.
 */
export async function askForKey(options: KeyPromptOptions): Promise<string> {
  const input = options.input ?? process.stdin;
  let arrived: string | undefined;
  let answered = false;

  const prompt = new PasswordPrompt({
    mask: S_PASSWORD_MASK,
    input,
    output: options.output,
    validate: (typed) => (arrived === undefined ? options.validate(typed ?? '') : undefined),
    render() {
      const bar = styleText('gray', S_BAR);
      if (arrived !== undefined && this.state === 'submit') return `${bar}\n${symbol('submit')}  ${options.arrivedMessage ?? options.message}`;
      const title = `${bar}\n${symbol(this.state)}  ${options.message}\n`;
      switch (this.state) {
        case 'error':
          return `${title}${styleText('yellow', S_BAR)}  ${this.masked}\n${styleText('yellow', S_BAR_END)}  ${styleText('yellow', this.error)}\n`;
        case 'submit':
          return `${title}${bar}  ${styleText('dim', this.masked)}`;
        case 'cancel':
          return `${title}${bar}  ${styleText('dim', styleText('strikethrough', this.masked))}${this.masked ? `\n${bar}` : ''}`;
        default:
          return `${title}${styleText('cyan', S_BAR)}  ${this.userInputWithCursor}\n${styleText('cyan', S_BAR_END)}\n`;
      }
    },
  });

  const typed = prompt.prompt();
  void options.arrival?.then((key) => {
    if (answered) return;
    arrived = key;
    // A prompt only ends on a key press, so answer this one the way Enter would.
    input.emit('keypress', '\r', { name: 'return', sequence: '\r' });
  });
  const answer = await typed;
  answered = true;
  if (arrived !== undefined) return arrived;
  if (isCancel(answer)) throw new Cancelled();
  return answer ?? '';
}
