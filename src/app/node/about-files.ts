// SPDX-License-Identifier: GPL-3.0-or-later
// What the About window shows, read from files next to the app: the licence, and the list of
// open-source components written at build time (scripts/write-third-party-licenses.ts).
import { readFile } from 'node:fs/promises';
import type { AboutDto, ComponentDto } from '#ipc-contract';

export interface AboutFiles {
  readonly name: string;
  readonly version: string;
  /** The app's licence (LICENSE). */
  readonly licenseFile: string;
  /** The components list (third-party-licenses.json). */
  readonly componentsFile: string;
}

/**
 * Reads the About window's contents. Never fails: a missing or unreadable licence is empty, and a
 * missing or malformed list is no components, so About still shows the name and version.
 */
export async function readAboutFiles(files: AboutFiles): Promise<AboutDto> {
  const [licenseText, components] = await Promise.all([
    readFile(files.licenseFile, 'utf8').catch(() => ''),
    readFile(files.componentsFile, 'utf8').then(parseComponents, () => []),
  ]);
  return { name: files.name, version: files.version, licenseText, components };
}

/** The list's entries that have the expected shape; anything else in the file is dropped. */
export function parseComponents(text: string): ComponentDto[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isComponent).map((entry) => ({
    name: entry.name,
    version: entry.version,
    license: entry.license,
    homepage: entry.homepage,
  }));
}

function isComponent(value: unknown): value is ComponentDto {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === 'string' &&
    typeof entry.version === 'string' &&
    typeof entry.license === 'string' &&
    (entry.homepage === null || typeof entry.homepage === 'string')
  );
}
