// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps the app's own message files consistent: what's shown has a message, every message is
// documented for translators, and translations don't drift from English.
import { describe, expect, it } from 'vitest';
import { errorCodes } from '#ipc-contract';
import { errorMessageKey, errorMessageParams } from './error-message';
import en from './messages/en.json';
import he from './messages/he.json';
import qqq from './messages/qqq.json';

const keys = (messages: Record<string, unknown>) =>
  Object.keys(messages).filter((key) => key !== '@metadata');
/** A message's text (the files also hold an @metadata object). */
function text(messages: Record<string, unknown>, key: string): string {
  const value = messages[key];
  return typeof value === 'string' ? value : '';
}
const highestParam = (text: string) =>
  Math.max(0, ...[...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));

describe('UI messages', () => {
  it('documents every English message in qqq.json, and nothing else', () => {
    expect(keys(qqq).sort()).toEqual(keys(en).sort());
  });

  it('has no Hebrew message without an English one', () => {
    expect(keys(he).filter((key) => !keys(en).includes(key))).toEqual([]);
  });

  it('prefixes every key with paperl10n-', () => {
    for (const key of keys(en)) expect(key).toMatch(/^paperl10n-[a-z0-9-]+$/);
  });

  it('has an English message and documentation for every error the app can show', () => {
    for (const code of errorCodes) {
      expect(keys(en)).toContain(errorMessageKey(code));
      expect(keys(qqq)).toContain(errorMessageKey(code));
    }
  });

  it('fills exactly the parameters each error message uses', () => {
    for (const code of errorCodes) {
      const message = text(en, errorMessageKey(code));
      expect(highestParam(message), code).toBe(errorMessageParams[code].length);
    }
  });

  // The same *set* of parameters, not the same count: a plural form may legitimately omit the
  // number ("{{PLURAL:$1|מסמך אחד|$1 מסמכים}}", where "מסמך אחד" means "one document").
  it('uses the same set of parameters in Hebrew as in English', () => {
    for (const key of keys(he)) {
      const params = (message: string) =>
        [...new Set([...message.matchAll(/\$\d+/g)].map((m) => m[0]))].sort();
      expect(params(text(he, key)), key).toEqual(params(text(en, key)));
    }
  });
});
