// SPDX-License-Identifier: GPL-3.0-or-later
// The typed API between the renderer and the main process, defined once (`#ipc-contract`).
// Plain, structured-cloneable data only: no classes, no functions, no branded types. The UI
// depends on this and nothing else from the app. See docs/adr/0006-process-model-and-ipc.md.
import type { Result } from '#kernel/result';

export interface LocaleDto {
  readonly id: string;
  readonly direction: 'ltr' | 'rtl';
}

export interface ProjectSummaryDto {
  /** An opaque handle. The renderer never sees the project's path on disk. */
  readonly projectId: string;
  readonly name: string;
  readonly sourceLocale: LocaleDto;
  readonly targetLocale: LocaleDto;
  readonly documentFormat: { readonly id: string; readonly displayName: string };
  /** Non-fatal problems, e.g. unknown keys in the config file. */
  readonly warnings: readonly string[];
}

export interface SourceDocumentDto {
  /** Locale-independent, e.g. "guide/getting-started". */
  readonly key: string;
  /** Project-relative. */
  readonly sourcePath: string;
  /** Project-relative; the file may not exist yet. */
  readonly targetPath: string;
}

/** Every error the renderer can receive. Each one has a UI message (enforced by a test). */
export const errorCodes = [
  'workspace.folder-unavailable',
  'workspace.config-missing',
  'workspace.config-unreadable',
  'workspace.config-invalid',
  'workspace.unknown-document-format',
  'workspace.no-document-format',
  'workspace.unknown-project',
  'formats.invalid-options',
  'formats.unsupported-project',
  'formats.file-access',
  'formats.plugin-failed',
  /** A bug: something threw instead of returning a result. Logged in main. */
  'internal.unexpected',
  /** The renderer sent arguments that don't match this contract. */
  'internal.invalid-request',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export interface ErrorDto {
  readonly code: ErrorCode;
  /** Values for the UI message, e.g. `{ formatId: 'format-vitepress' }`. */
  readonly params: Readonly<Record<string, string>>;
  /** Extra lines to show, e.g. each problem in an invalid config. */
  readonly details: readonly string[];
}

/** Everything the renderer can ask of the main process. One method = one IPC channel. */
export interface PaperLionApi {
  /** Shows the folder picker, then opens the project. `null` means the user cancelled. */
  openProject(): Promise<Result<ProjectSummaryDto | null, ErrorDto>>;
  listSourceDocuments(request: {
    readonly projectId: string;
  }): Promise<Result<readonly SourceDocumentDto[], ErrorDto>>;
}

export type ApiMethod = keyof PaperLionApi;

export const apiMethods = [
  'openProject',
  'listSourceDocuments',
] as const satisfies readonly ApiMethod[];

// A compile error here means a method was added to PaperLionApi but not to apiMethods.
type MissingMethods = Exclude<ApiMethod, (typeof apiMethods)[number]>;
export const apiMethodsAreComplete: [MissingMethods] extends [never] ? true : never = true;

export function channelFor(method: ApiMethod): `paperl10n:${ApiMethod}` {
  return `paperl10n:${method}`;
}
