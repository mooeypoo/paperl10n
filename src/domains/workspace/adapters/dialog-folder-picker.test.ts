// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { describeFolderPickerContract } from '../testing/folder-picker-contract.ts';
import { createDialogFolderPicker } from './dialog-folder-picker.ts';

describe('createDialogFolderPicker', () => {
  it.each<[string, { canceled: boolean; filePaths: string[] }, string | null]>([
    ['a chosen folder', { canceled: false, filePaths: ['/home/me/docs'] }, '/home/me/docs'],
    ['the first of several', { canceled: false, filePaths: ['/a', '/b'] }, '/a'],
    ['a cancelled dialog', { canceled: true, filePaths: [] }, null],
    ['cancelled even with paths', { canceled: true, filePaths: ['/a'] }, null],
    ['no paths', { canceled: false, filePaths: [] }, null],
  ])('%s', async (_description, result, expected) => {
    expect(await createDialogFolderPicker(() => Promise.resolve(result)).pick()).toBe(expected);
  });
});

describeFolderPickerContract('createDialogFolderPicker', (answer) =>
  createDialogFolderPicker(() =>
    Promise.resolve(
      answer === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [answer] },
    ),
  ),
);
