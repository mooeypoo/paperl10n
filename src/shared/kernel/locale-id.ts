// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from './brand.ts';
import { err, ok, type Result } from './result.ts';

/**
 * A well-formed BCP 47 language tag in canonical case, e.g. `he`, `pt-BR`, `zh-Hans`, `be-tarask`.
 *
 * This checks syntax and case only. It doesn't map deprecated codes (`iw` stays `iw`) or a
 * system's own codes (`pt_BR`, VitePress's `root`): translating those is the job of the format
 * plugin, and language data comes later (docs/plan/M1-languages.md).
 */
export type LocaleId = Brand<string, 'LocaleId'>;

export interface InvalidLocaleId {
  readonly code: 'locale-id.invalid';
  readonly input: string;
}

const LANGUAGE = /^(?:[a-z]{2,3}|[a-z]{5,8})$/;
const SCRIPT = /^[a-z]{4}$/;
const REGION = /^(?:[a-z]{2}|[0-9]{3})$/;
const VARIANT = /^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/;
const PRIVATE_USE = /^[a-z0-9]{1,8}$/;

/**
 * Supports language[-script][-region][-variant…][-x-private…].
 * Extensions (`-u-…`, `-t-…`) and legacy grandfathered tags are rejected for now.
 */
export function localeId(input: string): Result<LocaleId, InvalidLocaleId> {
  const invalid = err<InvalidLocaleId>({ code: 'locale-id.invalid', input });
  const subtags = input.toLowerCase().split('-');
  const canonical: string[] = [];
  let index = 0;

  const language = subtags[index];
  if (language === undefined || !LANGUAGE.test(language)) return invalid;
  canonical.push(language);
  index++;

  const script = subtags[index];
  if (script !== undefined && SCRIPT.test(script)) {
    canonical.push(script.charAt(0).toUpperCase() + script.slice(1));
    index++;
  }

  const region = subtags[index];
  if (region !== undefined && REGION.test(region)) {
    canonical.push(region.toUpperCase());
    index++;
  }

  const variants = new Set<string>();
  for (let variant = subtags[index]; variant !== undefined && VARIANT.test(variant); variant = subtags[index]) {
    if (variants.has(variant)) return invalid;
    variants.add(variant);
    canonical.push(variant);
    index++;
  }

  if (subtags[index] === 'x') {
    const privateUse = subtags.slice(index + 1);
    if (privateUse.length === 0 || !privateUse.every((subtag) => PRIVATE_USE.test(subtag))) {
      return invalid;
    }
    canonical.push('x', ...privateUse);
    index = subtags.length;
  }

  if (index !== subtags.length) return invalid;
  return ok(canonical.join('-') as LocaleId);
}
