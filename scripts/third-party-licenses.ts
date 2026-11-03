// SPDX-License-Identifier: GPL-3.0-or-later
// The open-source components Paper Lion includes, with their licences, for the About window (GPL
// compliance; docs/plan/M6-installer.md, question 7). Built from `pnpm licenses list --prod`,
// Electron (the runtime itself), and the data files the app bundles. Written at build time by
// write-third-party-licenses.ts, so the list is never out of date.

/** `pnpm licenses list --json`: entries grouped by licence (the fields this uses). */
export type LicenseReport = Readonly<
  Record<
    string,
    readonly {
      readonly name: string;
      readonly versions: readonly string[];
      readonly license: string;
      readonly homepage?: string;
    }[]
  >
>;

/** A bundled data file's header (language-data.json, plural-forms.json). */
export interface DataFileHeader {
  /** When it was generated (YYYY-MM-DD): the data's version. */
  readonly generated: string;
  readonly sources: readonly {
    readonly name: string;
    readonly url: string;
    readonly license: string;
  }[];
}

export interface Component {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly homepage: string | null;
}

/** Every package version once, then Electron and the data sources, sorted by name. */
export function componentList(
  report: LicenseReport,
  electronVersion: string,
  dataFiles: readonly DataFileHeader[],
): Component[] {
  const packages = Object.values(report)
    .flat()
    .flatMap((entry) =>
      entry.versions.map((version) => ({
        name: entry.name,
        version,
        license: entry.license,
        homepage: entry.homepage ?? null,
      })),
    );
  const electron = {
    name: 'electron',
    version: electronVersion,
    license: 'MIT',
    homepage: 'https://www.electronjs.org',
  };
  const data = dataFiles.flatMap((file) =>
    file.sources.map((source) => ({
      name: source.name,
      version: file.generated,
      license: source.license,
      homepage: source.url,
    })),
  );
  return [...packages, electron, ...data]
    .filter((entry) => !entry.name.startsWith('@paperl10n/'))
    .sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
}

/** Code-point order, so the list is the same on every machine (no locale-dependent collation). */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function serializeComponents(components: readonly Component[]): string {
  return `${JSON.stringify(components, null, 2)}\n`;
}
