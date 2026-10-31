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
export { blockFingerprint } from './domain/fingerprint.ts';
export {
  markSections,
  pageStatus,
  sectionStatuses,
  type PageRecord,
  type PageStatus,
  type RecordedSection,
  type SectionFingerprints,
  type SectionStatus,
} from './domain/status.ts';
export {
  emptyStatusFile,
  parseStatusFile,
  serializeStatusFile,
  type StatusFile,
  type StatusFileError,
} from './domain/status-file.ts';
export { outlineOf, pairDocumentSections } from './application/document-sections.ts';
export {
  documentChanges,
  sectionFingerprints,
  type ChangedBlock,
  type DocumentChanges,
  type Removal,
} from './application/document-status.ts';
