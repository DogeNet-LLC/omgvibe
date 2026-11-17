import { describe, expect, it } from 'vitest';

import { cmd, isNpxPath, resolveInvocation } from '../src/core/invocation';

describe('how omgvibe was started', () => {
  it('uses the name the entry file announces', () => {
    expect(resolveInvocation({ shim: 'ov', script: '/usr/local/lib/node_modules/omgvibe/bin/ov.mjs' })).toEqual({ program: 'ov', npx: false });
    expect(resolveInvocation({ script: '/usr/local/lib/node_modules/omgvibe/bin/omgvibe.mjs' })).toEqual({ program: 'omgvibe', npx: false });
    // Run from source, or with a name nobody installs: the package's own name.
    expect(resolveInvocation({})).toEqual({ program: 'omgvibe', npx: false });
    expect(resolveInvocation({ shim: 'something-else' }).program).toBe('omgvibe');
  });

  it('recognises npx by its cache directory, on either kind of path', () => {
    expect(resolveInvocation({ script: '/home/me/.npm/_npx/0a1b2c/node_modules/omgvibe/bin/omgvibe.mjs' })).toEqual({
      program: 'npx omgvibe',
      npx: true,
    });
    expect(isNpxPath('C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\0a1b2c\\node_modules\\omgvibe\\bin\\omgvibe.mjs')).toBe(true);
    expect(isNpxPath('/home/me/projects/_npx_notes/omgvibe/bin/omgvibe.mjs')).toBe(false);
  });

  it('builds the command lines shown to the user from that name', () => {
    expect(cmd('login', 'ov')).toBe('ov login');
    expect(cmd('', 'npx omgvibe')).toBe('npx omgvibe');
    // Tests run from source, so the default is the package's name.
    expect(cmd('claude')).toBe('omgvibe claude');
  });
});
