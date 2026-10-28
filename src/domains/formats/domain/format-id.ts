// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from '#kernel/brand';
import { err, ok, type Result } from '#kernel/result';

export type FormatKind = 'document' | 'catalog';

/**
 * A plugin's id, which is also its config key and folder name: `format-<system>` for document
 * formats, `catalog-<system>` for catalog formats (AGENTS.md naming).
 */
export type FormatId = Brand<string, 'FormatId'>;

export interface InvalidFormatId {
  readonly code: 'format-id.invalid';
  readonly input: string;
}

const FORMAT_ID = /^(format|catalog)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function formatId(input: string): Result<FormatId, InvalidFormatId> {
  return FORMAT_ID.test(input) ? ok(input as FormatId) : err({ code: 'format-id.invalid', input });
}

/** The kind of plugin an id names, from its prefix. */
export function kindOfFormatId(id: FormatId): FormatKind {
  return id.startsWith('format-') ? 'document' : 'catalog';
}
