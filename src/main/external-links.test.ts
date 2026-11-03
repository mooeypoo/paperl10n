// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isAllowedExternalLink } from './external-links.ts';

describe('isAllowedExternalLink', () => {
  it.each([
    ['https://moriel.tech', true],
    ['https://moriel.tech/', true],
    ['https://mooeypoo.github.io/paperl10n/', true],
    ['https://mooeypoo.github.io/paperl10n', true],
    ['https://github.com/mooeypoo/paperl10n', true],
    ['https://github.com/mooeypoo/paperl10n/releases/tag/v0.1.0', true],
    ['https://buymeacoffee.com/mooeypoo', true],
    ['http://moriel.tech', false],
    ['https://moriel.tech.example.com', false],
    ['https://mooeypoo.github.io/plotdevice/', false],
    ['https://mooeypoo.github.io/paperl10n-evil/', false],
    ['https://github.com/mooeypoo/paperl10n-evil/releases', false],
    ['https://github.com/someone/paperl10n/', false],
    ['https://buymeacoffee.com/someone', false],
    ['file:///etc/passwd', false],
    ['not a url', false],
  ])('%s → %s', (url, allowed) => {
    expect(isAllowedExternalLink(url)).toBe(allowed);
  });
});
