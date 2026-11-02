// SPDX-License-Identifier: GPL-3.0-or-later
import type { MessageWarningDto } from '#ipc-contract';
import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n';
import { warningMessage } from './warning-message';

const english = createI18n('en');
const t = (key: string, ...params: (string | number)[]) => english.t(key, ...params);
const isolated = (text: string) => `⁨${text}⁩`;

describe('warningMessage', () => {
  it.each<[MessageWarningDto, string]>([
    [
      { kind: 'missing', token: 'parameter', value: '$1' },
      `A parameter only in the source: ${isolated('$1')}`,
    ],
    [
      { kind: 'unexpected', token: 'parameter', value: '$3' },
      `A parameter only here: ${isolated('$3')}`,
    ],
    [
      { kind: 'missing', token: 'plural', value: '$1' },
      `A plural for ${isolated('$1')} only in the source`,
    ],
    [
      { kind: 'unexpected', token: 'plural', value: '$2' },
      `A plural for ${isolated('$2')} only here`,
    ],
    [
      { kind: 'missing', token: 'gender', value: '$1' },
      `A gender choice for ${isolated('$1')} only in the source`,
    ],
    [
      { kind: 'unexpected', token: 'gender', value: '$1' },
      `A gender choice for ${isolated('$1')} only here`,
    ],
    [
      { kind: 'missing', token: 'gender', value: '' },
      'A gender choice for the current user only in the source',
    ],
    [
      { kind: 'unexpected', token: 'gender', value: '' },
      'A gender choice for the current user only here',
    ],
    [
      { kind: 'missing', token: 'link', value: 'Special:Example' },
      `A link only in the source: ${isolated('Special:Example')}`,
    ],
    [
      { kind: 'unexpected', token: 'link', value: 'https://example.org' },
      `A link only here: ${isolated('https://example.org')}`,
    ],
    [
      { kind: 'missing', token: 'tag', value: 'strong' },
      `An HTML tag only in the source: ${isolated('<strong>')}`,
    ],
    [{ kind: 'unexpected', token: 'tag', value: 'b' }, `An HTML tag only here: ${isolated('<b>')}`],
    [
      { kind: 'missing', token: 'other', value: '{{SITENAME}}' },
      `A template or magic word only in the source: ${isolated('{{SITENAME}}')}`,
    ],
    [
      { kind: 'unexpected', token: 'other', value: '{{int:x}}' },
      `A template or magic word only here: ${isolated('{{int:x}}')}`,
    ],
    [
      { kind: 'unbalanced', brackets: '{}' },
      'The { and } here don’t pair up as they do in the source, so the message may show broken.',
    ],
    [
      { kind: 'unbalanced', brackets: '[]' },
      'The [ and ] here don’t pair up as they do in the source, so the message may show broken.',
    ],
  ])('says %o', (warning, expected) => {
    expect(warningMessage(warning, t)).toBe(expected);
  });

  it('is in Hebrew too', () => {
    const hebrew = createI18n('he');
    const inHebrew = (key: string, ...params: (string | number)[]) => hebrew.t(key, ...params);
    expect(warningMessage({ kind: 'missing', token: 'parameter', value: '$1' }, inHebrew)).toBe(
      `פרמטר שמופיע רק במקור: ${isolated('$1')}`,
    );
  });
});
