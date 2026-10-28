// SPDX-License-Identifier: GPL-3.0-or-later
// Refreshes Paper Lion's language catalog from Wikimedia. Run by hand, never in CI (it needs the
// network): `pnpm update:language-data`, then review the diff. docs/plan/M1-languages.md.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  buildLanguageData,
  serializeLanguageData,
  serializeLanguageNames,
  type LanguageInfoEntry,
  type UlsData,
} from './language-data.ts';

const OUTPUT = new URL('../src/domains/locale/domain/language-data.json', import.meta.url);
const NAMES_FOLDER = new URL('../src/domains/locale/domain/language-names/', import.meta.url);
const UI_MESSAGES = new URL('../src/ui/i18n/messages/', import.meta.url);
/** Interface languages the app ships, besides English: one per UI message file (src/ui/i18n). */
const INTERFACE_LANGUAGES = readdirSync(UI_MESSAGES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length))
  .filter((language) => language !== 'en' && language !== 'qqq')
  .sort();
/** Pinned, so an update is a deliberate change (published 2026-09-14). */
const ULS_VERSION = '2.0.4';
const ULS_URL = `https://unpkg.com/@wikimedia/language-data@${ULS_VERSION}/data/language-data.json`;
const API = 'https://meta.wikimedia.org/w/api.php';
// Wikimedia's API etiquette asks for an identifying User-Agent.
const USER_AGENT = 'paperl10n-language-data/1.0 (https://github.com/mooeypoo/paperl10n)';

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
  return response.json();
}

async function languageInfo(uselang: string): Promise<Record<string, LanguageInfoEntry>> {
  const all: Record<string, LanguageInfoEntry> = {};
  let continuation: Record<string, string> = {};
  for (;;) {
    const params = new URLSearchParams({
      action: 'query',
      meta: 'languageinfo',
      liprop: 'code|bcp47|dir|autonym|name|fallbacks',
      uselang,
      format: 'json',
      formatversion: '2',
      ...continuation,
    });
    const page = (await getJson(`${API}?${params.toString()}`)) as {
      query: { languageinfo: Record<string, LanguageInfoEntry> };
      continue?: Record<string, string>;
    };
    Object.assign(all, page.query.languageinfo);
    if (page.continue === undefined) return all;
    continuation = page.continue;
  }
}

const english = await languageInfo('en');
const localizedNames: Record<string, Record<string, string>> = {};
for (const uiLanguage of INTERFACE_LANGUAGES) {
  const info = await languageInfo(uiLanguage);
  localizedNames[uiLanguage] = Object.fromEntries(
    Object.entries(info).map(([code, e]) => [code, e.name]),
  );
}
const uls = (await getJson(ULS_URL)) as UlsData;

const { data, names, directionFromScript } = buildLanguageData({
  generated: new Date().toISOString().slice(0, 10),
  sources: [
    {
      name: 'MediaWiki languageinfo (names include Unicode CLDR data)',
      url: `${API}?action=query&meta=languageinfo`,
      license: 'GPL-2.0-or-later; CLDR: Unicode-3.0',
    },
    {
      name: `@wikimedia/language-data ${ULS_VERSION}`,
      url: 'https://github.com/wikimedia/language-data',
      license: 'GPL-2.0-or-later',
    },
  ],
  languageInfo: english,
  localizedNames,
  uls,
});
writeFileSync(OUTPUT, serializeLanguageData(data));
// One names file per interface language; files for languages the UI no longer has go away.
rmSync(NAMES_FOLDER, { recursive: true, force: true });
mkdirSync(NAMES_FOLDER);
for (const [uiLanguage, file] of Object.entries(names)) {
  writeFileSync(new URL(`${uiLanguage}.json`, NAMES_FOLDER), serializeLanguageNames(file));
}
console.log(
  `Wrote ${String(data.languages.length)} languages, ${String(Object.keys(data.aliases).length)} aliases, ${String(Object.keys(data.territories).length)} territories; names in: ${Object.keys(names).join(', ')}.`,
);
if (directionFromScript.length > 0) {
  console.log(`Right to left by script (languageinfo says ltr): ${directionFromScript.join(', ')}`);
}
