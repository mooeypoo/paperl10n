// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp.ts';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('is strict in production: own scripts and styles only, nothing inline, nothing remote', () => {
    const policy = directives(contentSecurityPolicy('production'));
    expect(policy.get('default-src')).toEqual(["'none'"]);
    expect(policy.get('script-src')).toEqual(["'self'"]);
    expect(policy.get('style-src')).toEqual(["'self'"]);
    expect(policy.get('connect-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(contentSecurityPolicy('production')).not.toMatch(/unsafe|http|ws:/);
  });

  it('relaxes only what the dev server needs, and never inline scripts or eval', () => {
    const policy = directives(contentSecurityPolicy('development'));
    expect(policy.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy.get('connect-src')).toEqual(["'self'", 'ws://localhost:*']);
    expect(policy.get('script-src')).toEqual(["'self'"]);
    expect(contentSecurityPolicy('development')).not.toContain('unsafe-eval');
  });
});
