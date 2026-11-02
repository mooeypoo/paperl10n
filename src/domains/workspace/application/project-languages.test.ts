// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { GuardedCatalogLayout, GuardedDocumentLayout } from '#domains/formats';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { projectLocales } from './project-languages.ts';

function locale(raw: string): LocaleId {
  const id = localeId(raw);
  if (!id.ok) throw new Error('test setup');
  return id.value;
}

const documents = {
  layout: {
    locales: ['en', 'he', 'fr'].map((raw) => {
      const folder = projectPath(raw);
      if (!folder.ok) throw new Error('test setup');
      return { locale: locale(raw), folder: folder.value };
    }),
  } as Pick<GuardedDocumentLayout, 'locales'> as GuardedDocumentLayout,
};
const catalogs = {
  layout: { locales: ['en', 'de', 'he'].map(locale) } as Pick<
    GuardedCatalogLayout,
    'locales'
  > as GuardedCatalogLayout,
};

describe('projectLocales', () => {
  it("lists the pages' locales, then the catalogs', each once", () => {
    expect(projectLocales(documents, catalogs)).toEqual(['en', 'he', 'fr', 'de']);
  });

  it('lists either kind alone, and none without either', () => {
    expect(projectLocales(documents, null)).toEqual(['en', 'he', 'fr']);
    expect(projectLocales(null, catalogs)).toEqual(['en', 'de', 'he']);
    expect(projectLocales(null, null)).toEqual([]);
  });
});
