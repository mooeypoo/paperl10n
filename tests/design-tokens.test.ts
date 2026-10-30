// SPDX-License-Identifier: GPL-3.0-or-later
// The dark theme is written twice in src/ui/styles/tokens.css: for the system's preference, and for the
// explicit choice (data-theme="dark"). Both must say the same.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../src/ui/styles/tokens.css', import.meta.url), 'utf8');

/** The custom properties declared in the block that starts at `opening`, by name. */
function declared(opening: string): Record<string, string> {
  const start = tokens.indexOf(opening);
  if (start === -1) throw new Error(`no block "${opening}"`);
  const body = tokens.slice(start + opening.length, tokens.indexOf('}', start));
  const found: Record<string, string> = {};
  for (const [, name = '', value = ''] of body.matchAll(/(--pl-[a-z0-9-]+):\s*([^;]+);/g)) {
    found[name] = value;
  }
  return found;
}

describe('design tokens', () => {
  it('defines the same dark theme for the system preference and the explicit choice', () => {
    const system = declared(":root:not([data-theme='light']) {");
    const chosen = declared(":root[data-theme='dark'] {");
    expect(Object.keys(system).length).toBeGreaterThan(10);
    expect(chosen).toEqual(system);
  });

  it('gives the dark theme a value for every color the light theme has', () => {
    const light = Object.keys(declared(':root {')).filter((name) => name.startsWith('--pl-color-'));
    const dark = Object.keys(declared(":root[data-theme='dark'] {"));
    expect(light.filter((name) => !dark.includes(name) && name !== '--pl-color-accent')).toEqual(
      [],
    );
  });
});
