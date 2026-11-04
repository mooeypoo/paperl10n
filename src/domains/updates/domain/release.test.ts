// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseLatestRelease } from './release.ts';

const file = {
  format: 1,
  version: '0.2.0',
  date: '2026-12-01',
  notes: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0',
  download: { en: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0' },
};
const release = {
  version: file.version,
  date: file.date,
  notes: file.notes,
  download: file.download,
};

describe('parseLatestRelease', () => {
  it.each<[string, unknown, unknown]>([
    ['a release', file, release],
    ['fields it does not know (ignored)', { ...file, sha256: 'x' }, release],
    [
      'downloads in more languages',
      { ...file, download: { en: 'https://a.example/en', he: 'https://a.example/he' } },
      { ...release, download: { en: 'https://a.example/en', he: 'https://a.example/he' } },
    ],
    ['another format', { ...file, format: 2 }, null],
    ['no format', { ...file, format: undefined }, null],
    ['a pre-release version', { ...file, version: '0.2.0-beta.1' }, null],
    ['a version with a v', { ...file, version: 'v0.2.0' }, null],
    ['a two-part version', { ...file, version: '0.2' }, null],
    ['a version that is a number', { ...file, version: 2 }, null],
    ['a date that is not a day', { ...file, date: '2026-12' }, null],
    ['notes over http', { ...file, notes: 'http://example.org/notes' }, null],
    ['notes that are not a link', { ...file, notes: 'javascript:alert(1)' }, null],
    ['notes with a space', { ...file, notes: 'https://a.example/x y' }, null],
    ['a very long link', { ...file, notes: `https://a.example/${'x'.repeat(3000)}` }, null],
    ['downloads without English', { ...file, download: { he: 'https://a.example/he' } }, null],
    ['a download that is not https', { ...file, download: { en: 'file:///etc/passwd' } }, null],
    ['downloads as a list', { ...file, download: ['https://a.example/'] }, null],
    ['no downloads', { ...file, download: null }, null],
    ['a list', [file], null],
    ['null', null, null],
    ['a string', 'latest', null],
  ])('%s', (_description, value, expected) => {
    expect(parseLatestRelease(value)).toEqual(expected);
  });
});

describe('isNewerVersion', () => {
  it.each<[string, string, boolean]>([
    ['0.2.0', '0.1.0', true],
    ['0.1.1', '0.1.0', true],
    ['1.0.0', '0.9.9', true],
    ['0.10.0', '0.9.0', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['0.9.0', '0.10.0', false],
    ['0.2.0', '0.0.0', true],
    ['0.2.0-beta', '0.1.0', false],
    ['0.2.0', 'dev', false],
    ['', '0.1.0', false],
  ])('%s after %s → %s', (candidate, current, newer) => {
    expect(isNewerVersion(candidate, current)).toBe(newer);
  });
});
