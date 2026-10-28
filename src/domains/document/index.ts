// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `document` domain: longform Markdown documents, frontmatter, and block
// segmentation. Other domains import this file only, as `#domains/document`.
// M0 has document identity only; parsing arrives in M1/M2.
export {
  documentKey,
  type DocumentKey,
  type InvalidDocumentKey,
  type SourceDocument,
} from './domain/source-document.ts';
