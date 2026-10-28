// SPDX-License-Identifier: GPL-3.0-or-later
import type { ErrorCode, ErrorDto } from '#ipc-contract';

/** The message key for an error code: `workspace.config-missing` → `paperl10n-error-workspace-config-missing`. */
export function errorMessageKey(code: ErrorCode): string {
  return `paperl10n-error-${code.replace('.', '-')}`;
}

/** Which `params` fill `$1`, `$2`, … in each error's message. Every code must be listed. */
export const errorMessageParams: Readonly<Record<ErrorCode, readonly string[]>> = {
  'workspace.folder-unavailable': ['reason'],
  'workspace.config-missing': [],
  'workspace.config-unreadable': ['file', 'problem'],
  'workspace.config-invalid': [],
  'workspace.unknown-document-format': ['formatId'],
  'workspace.no-document-format': [],
  'workspace.unknown-project': [],
  'workspace.unknown-document': ['key'],
  'workspace.document-unreadable': ['file', 'problem'],
  'formats.invalid-options': ['formatId', 'reason'],
  'formats.unsupported-project': ['formatId', 'reason'],
  'formats.file-access': ['formatId', 'file', 'problem'],
  'formats.plugin-failed': ['formatId', 'reason'],
  'internal.unexpected': [],
  'internal.invalid-request': [],
};

/** The translated message for an error, with its parameters in place. */
export function errorMessage(
  error: ErrorDto,
  t: (key: string, ...params: string[]) => string,
): string {
  return t(
    errorMessageKey(error.code),
    ...errorMessageParams[error.code].map((name) => error.params[name] ?? ''),
  );
}
