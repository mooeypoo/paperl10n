// SPDX-License-Identifier: GPL-3.0-or-later
// The status file: one per target language, committed with the translations, holding each
// recorded page (docs/plan/M3-sections.md). Written so that diffs and merges stay small: pages
// sorted by key, one section per line.
//
//   {
//     "version": 1,
//     "pages": {
//       "guide/install": [
//         { "kind": "intro", "blocks": ["3f2a…"] },
//         { "kind": "heading", "heading": "9c01…", "blocks": ["9c01…", "77de…"] },
//         { "kind": "heading", "heading": "e5b4…" }
//       ]
//     }
//   }
//
// A section without `blocks` was never marked up to date.
import { err, ok, type Result } from '#kernel/result';
import type { SectionKind } from './sections.ts';
import type { PageRecord, RecordedSection } from './status.ts';

export const STATUS_FILE_VERSION = 1;

/** A target language's status: each recorded page's record, by document key. */
export interface StatusFile {
  readonly pages: ReadonlyMap<string, PageRecord>;
}

export const emptyStatusFile: StatusFile = { pages: new Map() };

export type StatusFileError =
  | { readonly code: 'translation.status-file-invalid'; readonly problem: string }
  /** Written by a newer Paper Lion: never overwritten. */
  | { readonly code: 'translation.status-file-unsupported'; readonly version: number };

const FINGERPRINT = /^[0-9a-f]{16}$/;
const KINDS: readonly SectionKind[] = ['frontmatter', 'intro', 'heading'];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const invalid = (problem: string) =>
  err({ code: 'translation.status-file-invalid', problem } as const);

function readSection(raw: unknown, where: string): Result<RecordedSection, StatusFileError> {
  if (!isRecord(raw)) return invalid(`${where} must be an object`);
  const { kind, heading, blocks } = raw;
  if (typeof kind !== 'string' || !KINDS.includes(kind as SectionKind)) {
    return invalid(`${where}: "kind" must be one of ${KINDS.join(', ')}`);
  }
  if (kind === 'heading') {
    if (typeof heading !== 'string' || !FINGERPRINT.test(heading)) {
      return invalid(`${where}: a heading section needs its "heading" fingerprint`);
    }
  } else if (heading !== undefined) {
    return invalid(`${where}: only a heading section has a "heading"`);
  }
  if (
    blocks !== undefined &&
    !(
      Array.isArray(blocks) &&
      blocks.every((block) => typeof block === 'string' && FINGERPRINT.test(block))
    )
  ) {
    return invalid(`${where}: "blocks" must be a list of fingerprints`);
  }
  return ok({
    kind: kind as SectionKind,
    heading: kind === 'heading' ? (heading as string) : null,
    marked: blocks === undefined ? null : (blocks as string[]),
  });
}

/** Reads a status file's text. Anything malformed is an error: the file is never guessed at. */
export function parseStatusFile(text: string): Result<StatusFile, StatusFileError> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (thrown) {
    return invalid(`not valid JSON: ${thrown instanceof Error ? thrown.message : 'unknown error'}`);
  }
  if (!isRecord(input)) return invalid('must be a JSON object');
  const { version, pages } = input;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return invalid('"version" must be a positive whole number');
  }
  if (version > STATUS_FILE_VERSION) {
    return err({ code: 'translation.status-file-unsupported', version });
  }
  if (!isRecord(pages)) return invalid('"pages" must be an object keyed by document key');
  const read = new Map<string, PageRecord>();
  for (const [key, sections] of Object.entries(pages)) {
    if (!Array.isArray(sections)) return invalid(`page "${key}" must be a list of sections`);
    const record: RecordedSection[] = [];
    for (const [index, raw] of sections.entries()) {
      const section = readSection(raw, `page "${key}", section ${String(index + 1)}`);
      if (!section.ok) return section;
      record.push(section.value);
    }
    read.set(key, record);
  }
  return ok({ pages: read });
}

/** A status file's text: pages sorted by key (by code unit), one section per line. */
export function serializeStatusFile(status: StatusFile): string {
  const keys = [...status.pages.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pages = keys.map((key) => {
    const sections = (status.pages.get(key) ?? []).map((section) => {
      const written: Record<string, unknown> = { kind: section.kind };
      if (section.heading !== null) written.heading = section.heading;
      if (section.marked !== null) written.blocks = section.marked;
      return `      ${JSON.stringify(written)}`;
    });
    const list = sections.length === 0 ? '[]' : `[\n${sections.join(',\n')}\n    ]`;
    return `    ${JSON.stringify(key)}: ${list}`;
  });
  const body = pages.length === 0 ? '{}' : `{\n${pages.join(',\n')}\n  }`;
  return `{\n  "version": ${String(STATUS_FILE_VERSION)},\n  "pages": ${body}\n}\n`;
}
