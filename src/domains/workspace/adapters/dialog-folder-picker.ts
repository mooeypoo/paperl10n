// SPDX-License-Identifier: GPL-3.0-or-later
import type { FolderPicker } from '../application/ports/folder-picker.ts';

/** The shape of Electron's `dialog.showOpenDialog` result that the picker uses. */
export interface OpenDialogResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

/** Shows a "choose folder" dialog (in the app: Electron's `dialog.showOpenDialog`). */
export type ShowFolderDialog = () => Promise<OpenDialogResult>;

/** A `FolderPicker` backed by a native folder dialog. The dialog is injected, so this is testable
 * without Electron. */
export function createDialogFolderPicker(showFolderDialog: ShowFolderDialog): FolderPicker {
  return {
    async pick() {
      const result = await showFolderDialog();
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  };
}
