// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as translation from '#domains/translation';

describe('#domains/translation public API', () => {
  it('exports exactly these runtime values', () => {
    expect(Object.keys(translation).sort()).toEqual([
      'blockFingerprint',
      'checkTranslation',
      'documentChanges',
      'emptyStatusFile',
      'hintKinds',
      'markSections',
      'messageFingerprint',
      'messageStatus',
      'outlineOf',
      'pageStatus',
      'pairDocumentSections',
      'pairSections',
      'parseStatusFile',
      'recordMessages',
      'sectionFingerprints',
      'sectionStatuses',
      'sectionsAt',
      'serializeStatusFile',
      'splitLevel',
    ]);
  });
});
