// SPDX-License-Identifier: GPL-3.0-or-later
// A release as `latest.json` describes it (M6, question 6; written by the release tooling).

/** The newest release: what an update notice needs. */
export interface LatestRelease {
  /** A plain `x.y.z` version. */
  readonly version: string;
  /** When it was released (YYYY-MM-DD). */
  readonly date: string;
  /** The release notes (an `https` link). */
  readonly notes: string;
  /** Where to get it, by interface language; English (`en`) is always there. */
  readonly download: Readonly<Record<string, string>>;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An `https` link without spaces. Main checks a link again before opening it. */
const HTTPS = /^https:\/\/[^\s/?#]+[^\s]*$/;
const MAX_LINK = 2048;

export const isReleaseVersion = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 32 && VERSION.test(value);

const isHttps = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_LINK && HTTPS.test(value);

/**
 * `latest.json`'s contents as a release, or `null` when it isn't one this version can read. Fields
 * may be added later and are ignored; a new `format` means the file can't be understood.
 */
export function parseLatestRelease(value: unknown): LatestRelease | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const file = value as Record<string, unknown>;
  if (file.format !== 1 || !isReleaseVersion(file.version)) return null;
  if (typeof file.date !== 'string' || !DATE.test(file.date) || !isHttps(file.notes)) return null;
  const download = file.download;
  if (typeof download !== 'object' || download === null || Array.isArray(download)) return null;
  const links = Object.entries(download as Record<string, unknown>);
  if (!links.every(([, link]) => isHttps(link))) return null;
  if (!links.some(([language]) => language === 'en')) return null;
  return {
    version: file.version,
    date: file.date,
    notes: file.notes,
    download: Object.fromEntries(links) as Record<string, string>,
  };
}

const parse = (version: string): number[] | null =>
  VERSION.test(version) ? version.split('.').map(Number) : null;

/** Whether `candidate` is a later plain `x.y.z` version than `current`. Anything else is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const [a, b] = [parse(candidate), parse(current)];
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (x !== y) return x > y;
  }
  return false;
}
