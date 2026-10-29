// SPDX-License-Identifier: GPL-3.0-or-later
// Shared fixtures for UI tests: a fake client with scripted answers.
import type {
  DocumentPairDto,
  ErrorDto,
  LanguageDto,
  LanguageSuggestionsDto,
  LocaleDto,
  PaperLionApi,
  ProjectSummaryDto,
  SourceDocumentDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';

export const summary: ProjectSummaryDto = {
  projectId: 'p-1',
  name: 'basic',
  sourceLocale: { id: 'en', direction: 'ltr' },
  targetLocale: { id: 'he', direction: 'rtl' },
  documentFormat: { id: 'format-stub', displayName: 'Folder per locale (stub)' },
  warnings: [],
};

export const documents: readonly SourceDocumentDto[] = [
  {
    key: 'guide/getting-started',
    sourcePath: 'en/guide/getting-started.md',
    targetPath: 'he/guide/getting-started.md',
    targetExists: false,
  },
  { key: 'index', sourcePath: 'en/index.md', targetPath: 'he/index.md', targetExists: true },
];

export function error(
  code: ErrorDto['code'],
  params: Record<string, string> = {},
  details: string[] = [],
): ErrorDto {
  return { code, params, details };
}

type OpenAnswer = Result<ProjectSummaryDto | null, ErrorDto>;
type ListAnswer = Result<readonly SourceDocumentDto[], ErrorDto>;
type ReadAnswer = Result<DocumentPairDto, ErrorDto>;

const language = (tag: string, name: string, autonym: string | null, rtl = false): LanguageDto => ({
  tag,
  name,
  autonym,
  direction: rtl ? 'rtl' : 'ltr',
});

/** A small language catalog for picker tests. */
export const languages = {
  he: language('he', 'Hebrew', 'עברית', true),
  ar: language('ar', 'Arabic', 'العربية', true),
  fr: language('fr', 'French', 'français'),
  de: language('de', 'German', 'Deutsch'),
  lantern: language('art-x-lantern', 'art-x-lantern', null),
} as const;

const allLanguages: readonly LanguageDto[] = Object.values(languages);

/** A pair for a document key: the source as given, the translation if `target` is a text. */
export function pairFor(
  key: string,
  source: string,
  target: string | null = null,
): DocumentPairDto {
  const doc = (path: string, text: string) => ({
    path,
    mdx: path.endsWith('.mdx'),
    text,
    blocks:
      text.trim() === ''
        ? []
        : [{ kind: 'paragraph' as const, start: 0, end: text.trimEnd().length }],
    inline: [],
  });
  return {
    key,
    source: doc(`en/${key}.md`, source),
    target: target === null ? null : doc(`he/${key}.md`, target),
  };
}

/** A client whose answers are queued up front; it records what it was asked. */
export function fakeClient(
  answers: {
    open?: OpenAnswer[];
    list?: ListAnswer[];
    /** Answers by document key; a key without one gets a plain pair. */
    read?: Readonly<Record<string, ReadAnswer>>;
    /** The picker's sections before typing (default: Hebrew in the project, French suggested). */
    suggest?: Result<LanguageSuggestionsDto, ErrorDto>;
    /** The answer to choosing a target (default: the language, as LTR unless Hebrew/Arabic). */
    choose?: Result<LocaleDto, ErrorDto>;
    /** The answer to saving a page (default: written to he/<key>.md). */
    save?: Result<{ path: string; written: boolean }, ErrorDto>;
  } = {},
) {
  const open = [...(answers.open ?? [])];
  const list = [...(answers.list ?? [])];
  const calls: string[] = [];
  const client: PaperLionApi = {
    openProject: () => {
      calls.push('openProject');
      const next = open.shift();
      return next === undefined
        ? Promise.reject(new Error('no scripted answer'))
        : Promise.resolve(next);
    },
    listSourceDocuments: ({ projectId }) => {
      calls.push(`listSourceDocuments:${projectId}`);
      const next = list.shift();
      return next === undefined
        ? Promise.reject(new Error('no scripted answer'))
        : Promise.resolve(next);
    },
    readDocumentPair: ({ projectId, key }) => {
      calls.push(`readDocumentPair:${projectId}:${key}`);
      return Promise.resolve(
        answers.read?.[key] ?? { ok: true, value: pairFor(key, `Source of ${key}\n`) },
      );
    },
    suggestTargetLanguages: ({ projectId, recent, uiLanguage }) => {
      calls.push(`suggestTargetLanguages:${projectId}:${uiLanguage}:${recent.join(',')}`);
      return Promise.resolve(
        answers.suggest ?? {
          ok: true,
          value: { inProject: [languages.he], recent: [], suggested: [languages.fr] },
        },
      );
    },
    // Matches tags and names that start with the query, like the real search's best ranks.
    searchTargetLanguages: ({ projectId, query, uiLanguage }) => {
      calls.push(`searchTargetLanguages:${projectId}:${uiLanguage}:${query}`);
      const folded = query.trim().toLowerCase();
      return Promise.resolve({
        ok: true,
        value: allLanguages.filter((l) =>
          [l.tag, l.name, l.autonym ?? ''].some((name) => name.toLowerCase().startsWith(folded)),
        ),
      });
    },
    saveDocument: ({ projectId, key, text }) => {
      calls.push(`saveDocument:${projectId}:${key}:${String(text.length)}`);
      return Promise.resolve(
        answers.save ?? { ok: true, value: { path: `he/${key}.md`, written: true } },
      );
    },
    chooseTargetLocale: ({ projectId, language: tag }) => {
      calls.push(`chooseTargetLocale:${projectId}:${tag}`);
      const known = allLanguages.find((l) => l.tag === tag);
      return Promise.resolve(
        answers.choose ?? { ok: true, value: { id: tag, direction: known?.direction ?? 'ltr' } },
      );
    },
  };
  return { client, calls };
}

/** An element's text including what's inside the editors' shadow roots (markdown-editor.ts). */
export function textWithEditors(element: Element | undefined): string {
  if (element === undefined) return '';
  const editors = [...element.querySelectorAll('.markdown-editor')].map(
    (editor) => editor.shadowRoot?.querySelector('.cm-content')?.textContent ?? '',
  );
  return [element.textContent, ...editors].join('\n');
}
