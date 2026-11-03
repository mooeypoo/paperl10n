// SPDX-License-Identifier: GPL-3.0-or-later
// Refreshes catalog-gettext's plural formulas from php-gettext/Languages. Run by hand, never in CI
// (it needs the network): `pnpm update:gettext-plurals`, then review the diff.
import { writeFileSync } from 'node:fs';
import {
  buildPluralForms,
  serializePluralForms,
  type PublishedLanguage,
} from './gettext-plurals.ts';

const OUTPUT = new URL('../src/plugins/catalog-gettext/plural-forms.json', import.meta.url);
/** Pinned, so an update is a deliberate change: the CLDR version the data was built from. */
const CLDR_VERSION = '48.1';
const URL_BASE = 'https://php-gettext.github.io/Languages/data/versions';

const url = `${URL_BASE}/${CLDR_VERSION}.min.json`;
const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
const published = (await response.json()) as Record<string, PublishedLanguage>;
const file = buildPluralForms(published, new Date().toISOString().slice(0, 10), {
  name: `gettext plural rules from Unicode CLDR ${CLDR_VERSION}, by php-gettext/Languages`,
  url,
});
writeFileSync(OUTPUT, serializePluralForms(file));
console.log(
  `${String(Object.keys(file.languages).length)} languages written to ${OUTPUT.pathname}`,
);
