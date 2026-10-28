// SPDX-License-Identifier: GPL-3.0-or-later

/** Asks the user for a project folder (in the app: the native folder dialog). */
export interface FolderPicker {
  /** The chosen folder's absolute path, or `null` if the user cancelled. */
  pick(): Promise<string | null>;
}
