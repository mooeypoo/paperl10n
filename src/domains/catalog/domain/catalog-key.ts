// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from '#kernel/brand';
import { err, ok, type Result } from '#kernel/result';

/**
 * A catalog's locale-independent identity, as a document key is a page's. The format plugin
 * chooses it from its system's layout: banana-i18n's messages folder (`i18n/api`), gettext's
 * domain (`myapp`).
 */
export type CatalogKey = Brand<string, 'CatalogKey'>;

export interface InvalidCatalogKey {
  readonly code: 'catalog-key.invalid';
  readonly input: string;
}

/** A catalog key: any non-empty text, kept as written. */
export function catalogKey(input: string): Result<CatalogKey, InvalidCatalogKey> {
  if (input === '') return err({ code: 'catalog-key.invalid', input });
  return ok(input as CatalogKey);
}
