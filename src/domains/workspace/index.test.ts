// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as workspace from '#domains/workspace';

describe('#domains/workspace public API', () => {
  it('exports exactly these runtime values', () => {
    expect(Object.keys(workspace).sort()).toEqual([
      'CONFIG_FILE_NAME',
      'DEFAULT_SOURCE_LOCALE',
      'createChooseTargetLocale',
      'createListSourceDocuments',
      'createOpenProject',
      'createReadDocumentPair',
      'createSearchTargetLanguages',
      'createSuggestTargetLanguages',
      'parseProjectConfig',
    ]);
  });
});
