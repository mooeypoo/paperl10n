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
  /** `null` when the project has no target language yet: the UI asks for one. */
  readonly targetLocale: LocaleDto | null;
  readonly documentFormat: { readonly id: string; readonly displayName: string };
  /** Non-fatal problems, e.g. unknown keys in the config file. */
  readonly warnings: readonly string[];
}

/** A language as the picker shows it. */
export interface LanguageDto {
  /** The BCP 47 tag, e.g. "pt-BR". */
  readonly tag: string;
  /** The name in the interface language the request asked for (English when unknown). */
  readonly name: string;
  /** The language's name in itself, when known. */
  readonly autonym: string | null;
  readonly direction: 'ltr' | 'rtl';
}

/** The picker's sections before the user types. A language appears in one section at most. */
export interface LanguageSuggestionsDto {
  readonly inProject: readonly LanguageDto[];
  readonly recent: readonly LanguageDto[];
  readonly suggested: readonly LanguageDto[];
}

export interface SourceDocumentDto {
  /** Locale-independent, e.g. "guide/getting-started". */
  readonly key: string;
  /** Project-relative. */
  readonly sourcePath: string;
  /** Project-relative; the file may not exist yet. */
  readonly targetPath: string;
  /** Whether the translation file exists. */
  readonly targetExists: boolean;
}

/** Kept equal to the `document` domain's block kinds by a test. */
export const blockKindDtos = [
  'frontmatter',
  'heading',
  'paragraph',
  'list',
  'blockquote',
  'code',
  'table',
  'html',
  'thematic-break',
  'link-definition',
  'container-fence',
  'mdx-esm',
] as const;

/** Offsets are UTF-16 code units into the document's `text`; `end` is exclusive. */
export interface BlockDto {
  readonly kind: (typeof blockKindDtos)[number];
  readonly start: number;
  readonly end: number;
  /** Headings only: 1–6. */
  readonly depth?: number;
}

export interface InlineSpanDto {
  readonly kind: 'markup' | 'code' | 'url';
  readonly start: number;
  readonly end: number;
}

export interface DocumentTextDto {
  /** Project-relative. */
  readonly path: string;
  /** The file's exact text. */
  readonly text: string;
  readonly blocks: readonly BlockDto[];
  readonly inline: readonly InlineSpanDto[];
}

export interface DocumentPairDto {
  readonly key: string;
  readonly source: DocumentTextDto;
  /** `null` when the translation file doesn't exist yet. */
  readonly target: DocumentTextDto | null;
}

/** Every error the renderer can receive. Each one has a UI message (enforced by a test). */
export const errorCodes = [
  'workspace.folder-unavailable',
  'workspace.config-missing',
  'workspace.config-unreadable',
  'workspace.config-unwritable',
  'workspace.config-invalid',
  'workspace.unknown-document-format',
  'workspace.no-document-format',
  'workspace.unknown-project',
  'workspace.no-target-locale',
  'workspace.unknown-language',
  'workspace.target-is-source',
  'workspace.unknown-document',
  'workspace.document-unreadable',
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
  /** A page's source and its translation, read and parsed. */
  readDocumentPair(request: {
    readonly projectId: string;
    readonly key: string;
  }): Promise<Result<DocumentPairDto, ErrorDto>>;
  /** Languages to offer as the target before the user types. Never the source language. */
  suggestTargetLanguages(request: {
    readonly projectId: string;
    /** The user's recent picks, most recent first. */
    readonly recent: readonly string[];
    /** The OS languages, best first (`navigator.languages`). */
    readonly systemLanguages: readonly string[];
    readonly uiLanguage: string;
  }): Promise<Result<LanguageSuggestionsDto, ErrorDto>>;
  /** Languages matching what the user typed, best first. Never the source language. */
  searchTargetLanguages(request: {
    readonly projectId: string;
    readonly query: string;
    readonly uiLanguage: string;
  }): Promise<Result<readonly LanguageDto[], ErrorDto>>;
  /** Makes a language the project's target and saves it to the config; returns it with its direction. */
  chooseTargetLocale(request: {
    readonly projectId: string;
    readonly language: string;
  }): Promise<Result<LocaleDto, ErrorDto>>;
}

export type ApiMethod = keyof PaperLionApi;

export const apiMethods = [
  'openProject',
  'listSourceDocuments',
  'readDocumentPair',
  'suggestTargetLanguages',
  'searchTargetLanguages',
  'chooseTargetLocale',
] as const satisfies readonly ApiMethod[];

// A compile error here means a method was added to PaperLionApi but not to apiMethods.
type MissingMethods = Exclude<ApiMethod, (typeof apiMethods)[number]>;
export const apiMethodsAreComplete: [MissingMethods] extends [never] ? true : never = true;

export function channelFor(method: ApiMethod): `paperl10n:${ApiMethod}` {
  return `paperl10n:${method}`;
}
