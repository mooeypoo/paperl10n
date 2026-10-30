// SPDX-License-Identifier: GPL-3.0-or-later
// Shared fixtures for UI tests: a fake client with scripted answers.
import type {
  DocumentPairDto,
  DocumentStatusDto,
  ErrorDto,
  LanguageDto,
  LanguageSuggestionsDto,
  LocaleDto,
  PaperLionApi,
  ProjectSummaryDto,
  SourceDocumentDto,
  SourceDocumentListDto,
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
    hasDraft: false,
    status: 'missing',
  },
  {
    key: 'index',
    sourcePath: 'en/index.md',
    targetPath: 'he/index.md',
    targetExists: true,
    hasDraft: false,
    status: 'draft',
  },
];

export function error(
  code: ErrorDto['code'],
  params: Record<string, string> = {},
  details: string[] = [],
): ErrorDto {
  return { code, params, details };
}

type OpenAnswer = Result<ProjectSummaryDto | null, ErrorDto>;
/** Just the pages: listed with a status file that exists and reads fine. */
type ListAnswer = Result<readonly SourceDocumentDto[] | SourceDocumentListDto, ErrorDto>;
type ReadAnswer = Result<DocumentPairDto, ErrorDto>;
type SaveAnswer = Result<{ path: string; written: boolean }, ErrorDto>;

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
    draft: null,
    sections: { paired: true, level: null, pairs: [] },
    status: {
      page: target === null ? 'missing' : 'draft',
      sections: [],
      changes: { blocks: [], removals: [] },
      sourceFingerprint: 'f',
    },
  };
}

const asList = (answer: ListAnswer): Result<SourceDocumentListDto, ErrorDto> =>
  answer.ok && Array.isArray(answer.value)
    ? { ok: true, value: { documents: answer.value, statusFile: { exists: true, problem: null } } }
    : (answer as Result<SourceDocumentListDto, ErrorDto>);

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
    /**
     * The answer to saving a page (default: written to he/<key>.md). A list answers one save
     * each, in order, then the default.
     */
    save?: SaveAnswer | SaveAnswer[];
    /** The answer to keeping a draft (default: kept). */
    saveDraft?: Result<null, ErrorDto>;
    /** The answer to marking up to date (default: every section and the page translated). */
    mark?: Result<DocumentStatusDto, ErrorDto>;
    /** The answer to marking existing translations up to date (default: `index` marked). */
    markExisting?: Result<{ marked: readonly string[] }, ErrorDto>;
  } = {},
) {
  const open = [...(answers.open ?? [])];
  const list = [...(answers.list ?? [])];
  const saves = Array.isArray(answers.save) ? [...answers.save] : [];
  const save = Array.isArray(answers.save) ? undefined : answers.save;
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
        : Promise.resolve(asList(next));
    },
    readDocumentPair: ({ projectId, key }) => {
      calls.push(`readDocumentPair:${projectId}:${key}`);
      // A copy, as IPC delivers: reading a page again never gives the same object.
      return Promise.resolve(
        structuredClone(
          answers.read?.[key] ?? { ok: true, value: pairFor(key, `Source of ${key}\n`) },
        ),
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
    // Logs the text and the base (or "new"), JSON-quoted so line endings are visible.
    saveDocument: ({ projectId, key, text, base }) => {
      calls.push(
        `saveDocument:${projectId}:${key}:${JSON.stringify(text)}:${base === null ? 'new' : JSON.stringify(base)}`,
      );
      return Promise.resolve(
        saves.shift() ?? save ?? { ok: true, value: { path: `he/${key}.md`, written: true } },
      );
    },
    saveDraft: ({ projectId, key, text, base }) => {
      calls.push(
        `saveDraft:${projectId}:${key}:${JSON.stringify(text)}:${base === null ? 'new' : JSON.stringify(base)}`,
      );
      return Promise.resolve(answers.saveDraft ?? { ok: true, value: null });
    },
    discardDraft: ({ projectId, key }) => {
      calls.push(`discardDraft:${projectId}:${key}`);
      return Promise.resolve({ ok: true, value: null });
    },
    markUpToDate: ({ projectId, key, sourceFingerprint, sections }) => {
      calls.push(
        `markUpToDate:${projectId}:${key}:${sourceFingerprint}:${sections === null ? 'page' : sections.join(',')}`,
      );
      return Promise.resolve(
        answers.mark ?? {
          ok: true,
          value: { page: 'translated', sections: [], changes: { blocks: [], removals: [] } },
        },
      );
    },
    markExistingUpToDate: ({ projectId }) => {
      calls.push(`markExistingUpToDate:${projectId}`);
      return Promise.resolve(answers.markExisting ?? { ok: true, value: { marked: ['index'] } });
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
