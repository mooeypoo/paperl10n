// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `translation` domain: source↔target pairing by section, status
// (missing/draft/translated/outdated), and source-change tracking.
// Other domains import this file only, as `#domains/translation`. See AGENTS.md.
export {
  pairSections,
  sectionsAt,
  splitLevel,
  type OutlineBlock,
  type Section,
  type SectionKind,
  type SectionPair,
  type SectionPairing,
} from './domain/sections.ts';
export { outlineOf, pairDocumentSections } from './application/document-sections.ts';
