// SPDX-License-Identifier: GPL-3.0-or-later
// Writes build/third-party-licenses.json, the About window's credits. Runs at the start of every
// `pnpm build`; electron-builder ships the file beside the app. Usage:
// node scripts/write-third-party-licenses.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  componentList,
  serializeComponents,
  type DataFileHeader,
  type LicenseReport,
} from './third-party-licenses.ts';

const OUTPUT = new URL('../build/third-party-licenses.json', import.meta.url);
const DATA_FILES = [
  new URL('../src/domains/locale/domain/language-data.json', import.meta.url),
  new URL('../src/plugins/catalog-gettext/plural-forms.json', import.meta.url),
];

const report = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }),
) as LicenseReport;
const electron = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('electron/package.json'), 'utf8'),
) as { version: string };
const dataFiles = DATA_FILES.map(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as DataFileHeader,
);

const components = componentList(report, electron.version, dataFiles);
mkdirSync(new URL('.', OUTPUT), { recursive: true });
writeFileSync(OUTPUT, serializeComponents(components));
console.log(`Third-party licences: ${String(components.length)} components.`);
