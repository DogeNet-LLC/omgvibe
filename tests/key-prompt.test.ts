import { PassThrough, Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { askForKey } from '../src/core/key-prompt';
import { Cancelled } from '../src/core/ui';

/** A terminal stand-in: keys are written to `input`, and `screen()` is everything drawn so far. */
function terminal(): { input: PassThrough; output: Writable; screen: () => string } {
  let drawn = '';
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      drawn += chunk.toString();
      done();
    },
  });
  return { input: new PassThrough(), output, screen: () => drawn };
}

const validate = (typed: string): string | undefined => (typed ? undefined : 'Enter your API key.');
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('key prompt', () => {
  it('takes a typed key and never draws it', async () => {
    const { input, output, screen } = terminal();
    const answer = askForKey({ message: 'Paste your API key', validate, input, output });
    input.write('sk-typed');
    input.write('\r');
    await expect(answer).resolves.toBe('sk-typed');
    expect(screen()).toContain('Paste your API key');
    expect(screen()).not.toContain('sk-typed');
  });

  it('ends with the key that arrives from the browser', async () => {
    const { input, output, screen } = terminal();
    let arrive!: (key: string) => void;
    const arrival = new Promise<string>((resolve) => (arrive = resolve));
    const answer = askForKey({ message: 'Waiting for the browser', arrivedMessage: 'Authorized in the browser', validate, arrival, input, output });
    await tick();
    expect(screen()).toContain('Waiting for the browser');
    expect(screen()).not.toContain('Authorized in the browser');
    arrive('sk-from-browser');
    await expect(answer).resolves.toBe('sk-from-browser');
    expect(screen()).toContain('Authorized in the browser');
    expect(screen()).not.toContain('Enter your API key.');
  });

  it('prefers the arrived key over half-typed text and a shown error', async () => {
    const { input, output } = terminal();
    let arrive!: (key: string) => void;
    const arrival = new Promise<string>((resolve) => (arrive = resolve));
    const answer = askForKey({ message: 'Waiting', validate, arrival, input, output });
    input.write('\r');
    await tick();
    input.write('sk-half');
    await tick();
    arrive('sk-from-browser');
    await expect(answer).resolves.toBe('sk-from-browser');
  });

  it('ignores a key that arrives after the prompt was answered', async () => {
    const { input, output } = terminal();
    let arrive!: (key: string) => void;
    const arrival = new Promise<string>((resolve) => (arrive = resolve));
    const answer = askForKey({ message: 'Waiting', validate, arrival, input, output });
    input.write('sk-pasted\r');
    await expect(answer).resolves.toBe('sk-pasted');
    arrive('sk-late');
    await tick();
  });

  it('throws when the user backs out', async () => {
    const { input, output } = terminal();
    const answer = askForKey({ message: 'Paste your API key', validate, input, output });
    input.write('\u0003');
    await expect(answer).rejects.toBeInstanceOf(Cancelled);
  });
});
