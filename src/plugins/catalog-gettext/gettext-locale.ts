// SPDX-License-Identifier: GPL-3.0-or-later
// gettext names locales `ll_CC@modifier` (`pt_BR`, `sr@latin`, `ca@valencia`, maybe with an
// encoding: `de_DE.UTF-8`); Paper Lion saves BCP 47 (`pt-BR`, `sr-Latn`, `ca-valencia`). The
// modifiers that name a script become BCP 47 scripts, and back.
import { localeId, type LocaleId } from '#plugin-api';

const SCRIPT_MODIFIERS: Readonly<Record<string, string>> = {
  latin: 'Latn',
  cyrillic: 'Cyrl',
  devanagari: 'Deva',
  arabic: 'Arab',
  adlam: 'Adlm',
};
const MODIFIER_FOR_SCRIPT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SCRIPT_MODIFIERS).map(([modifier, script]) => [script, modifier]),
);

/** A gettext locale name as a BCP 47 locale id, or `undefined` when it isn't one. */
export function localeFromGettext(name: string): LocaleId | undefined {
  const [main = '', modifier] = name.replace(/\.[^@]*/, '').split('@');
  const [language = '', ...rest] = main.split(/[_-]/);
  // gettext's languages are ISO 639 codes: a `django.po` or `LINGUAS` isn't a locale.
  if (!/^[a-z]{2,3}$/i.test(language)) return undefined;
  const script = rest.find((part) => /^[a-z]{4}$/i.test(part));
  const region = rest.find((part) => /^(?:[a-z]{2}|\d{3})$/i.test(part));
  if (rest.length !== (script === undefined ? 0 : 1) + (region === undefined ? 0 : 1)) {
    return undefined;
  }
  const fromModifier =
    modifier === undefined ? undefined : SCRIPT_MODIFIERS[modifier.toLowerCase()];
  const parts = [
    language,
    fromModifier ?? script,
    region,
    modifier !== undefined && fromModifier === undefined ? modifier : undefined,
  ].filter((part): part is string => part !== undefined);
  const locale = localeId(parts.join('-'));
  return locale.ok ? locale.value : undefined;
}

/** A locale id as gettext names it (`pt-BR` → `pt_BR`, `sr-Latn` → `sr@latin`). */
export function gettextName(locale: LocaleId): string {
  const [language = '', ...rest] = locale.split('-');
  const script = rest.find((part) => /^[A-Z][a-z]{3}$/.test(part));
  const region = rest.find((part) => /^(?:[A-Z]{2}|\d{3})$/.test(part));
  const variants = rest.filter((part) => part !== script && part !== region);
  const modifier = script === undefined ? undefined : MODIFIER_FOR_SCRIPT[script];
  const name = [language, modifier === undefined ? script : undefined, region]
    .filter((part): part is string => part !== undefined)
    .join('_');
  const tail = [modifier, ...variants].filter((part): part is string => part !== undefined);
  return tail.length === 0 ? name : `${name}@${tail.join('@')}`;
}
