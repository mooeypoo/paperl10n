// SPDX-License-Identifier: GPL-3.0-or-later
// The catalog shipped with the app: the generated files in this folder, checked once when first
// used. A names file per interface language (scripts/update-language-data.ts writes them); a
// test checks every file in language-names/ is listed here.
import { createLanguageCatalog, type LanguageCatalog } from './language-catalog.ts';
import data from './language-data.json' with { type: 'json' };
import {
  isLanguageDataFile,
  isLanguageNamesFile,
  type LanguageNamesFile,
} from './language-data-file.ts';
import he from './language-names/he.json' with { type: 'json' };

/** Names files by interface language. */
export const bundledNames: Readonly<Record<string, unknown>> = { he };

let catalog: LanguageCatalog | undefined;

export function bundledLanguageCatalog(): LanguageCatalog {
  if (catalog !== undefined) return catalog;
  const raw: unknown = data;
  if (!isLanguageDataFile(raw)) throw new Error('language-data.json has an unexpected shape');
  const names: Record<string, LanguageNamesFile> = {};
  for (const [uiLanguage, file] of Object.entries(bundledNames)) {
    if (!isLanguageNamesFile(file))
      throw new Error(`language-names/${uiLanguage}.json has an unexpected shape`);
    names[uiLanguage] = file;
  }
  catalog = createLanguageCatalog(raw, names);
  return catalog;
}
