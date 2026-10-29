// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import { detects, fakeDocumentPlugin } from '#domain-testing/formats';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createChooseTargetLocale } from './choose-target-locale.ts';
import { createOpenProject } from './open-project.ts';
import { createSearchTargetLanguages, createSuggestTargetLanguages } from './target-languages.ts';

/** Opens a project (source `en`, locale folders `he` and `qaa-x-folder`) and returns its use cases. */
async function opened(settings: Record<string, unknown> = { targetLocale: 'he' }) {
  const registry = createFormatRegistry(
    [fakeDocumentPlugin('format-fake', detects('likely'), ['he', 'qaa-x-folder'])],
    { apiVersion: 2 },
  );
  if (!registry.ok) throw new Error('test setup: registry');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const open = createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({
      '/p': { 'paperl10n.config.json': JSON.stringify(settings), 'en/index.md': '# Home\n' },
    }),
    registry: registry.value,
    sessions,
  });
  const summary = await open();
  if (!summary.ok || summary.value === null) throw new Error('test setup: open');
  return {
    projectId: summary.value.projectId,
    sessions,
    suggest: createSuggestTargetLanguages({ sessions }),
    search: createSearchTargetLanguages({ sessions }),
    choose: createChooseTargetLocale({ sessions }),
  };
}

const request = { recent: [], systemLanguages: [], uiLanguage: 'en' };
const tags = (languages: readonly { tag: string }[]) => languages.map((language) => language.tag);

describe('suggestTargetLanguages', () => {
  it("offers the project's languages first, its own codes included, never the source", async () => {
    const { projectId, suggest } = await opened({
      targetLocale: 'he',
      languages: { 'art-x-lantern': { name: 'Lanternese' } },
    });
    const result = suggest(projectId, request);
    expect(result.ok && tags(result.value.inProject)).toEqual([
      'he',
      'qaa-x-folder',
      'art-x-lantern',
    ]);
    expect(result.ok && tags(result.value.suggested)).not.toContain('en');
  });

  it('offers the current target even when the project has no folder for it yet', async () => {
    const { projectId, suggest } = await opened({ targetLocale: 'fr' });
    const result = suggest(projectId, request);
    expect(result.ok && tags(result.value.inProject)).toEqual(['he', 'qaa-x-folder', 'fr']);
  });

  it('then recent picks the project lacks, then English, OS, and region languages', async () => {
    const { projectId, suggest } = await opened({ sourceLocale: 'de', targetLocale: 'he' });
    const result = suggest(projectId, {
      recent: ['he', 'ar', 'de', 'not-a-language'],
      systemLanguages: ['fr-CA'],
      uiLanguage: 'en',
    });
    if (!result.ok) throw new Error('expected suggestions');
    expect(tags(result.value.recent)).toEqual(['ar']);
    expect(tags(result.value.suggested).slice(0, 3)).toEqual(['en', 'fr-CA', 'fr']);
  });

  it('names each language in the interface language, with its autonym and direction', async () => {
    const { projectId, suggest } = await opened();
    const result = suggest(projectId, { ...request, uiLanguage: 'he' });
    expect(result.ok && result.value.inProject[0]).toEqual({
      tag: 'he',
      name: 'עברית',
      autonym: 'עברית',
      direction: 'rtl',
    });
  });

  it('reports a project that is not open', async () => {
    const { suggest } = await opened();
    expect(suggest('nope', request)).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});

describe('searchTargetLanguages', () => {
  it('finds languages by name in the interface language, best first', async () => {
    const { projectId, search } = await opened();
    const result = search(projectId, { query: 'ערבית', uiLanguage: 'he' });
    expect(result.ok && result.value[0]).toEqual({
      tag: 'ar',
      name: 'ערבית',
      autonym: 'العربية',
      direction: 'rtl',
    });
  });

  it("finds the project's own codes", async () => {
    const { projectId, search } = await opened();
    const result = search(projectId, { query: 'qaa-x-folder', uiLanguage: 'en' });
    expect(result.ok && tags(result.value)).toEqual(['qaa-x-folder']);
  });

  it('never returns the source language, and still returns a full page', async () => {
    const { projectId, search } = await opened();
    const result = search(projectId, { query: 'e', uiLanguage: 'en' });
    if (!result.ok) throw new Error('expected results');
    expect(tags(result.value)).not.toContain('en');
    expect(result.value).toHaveLength(50);
  });

  it('returns nothing for an empty query', async () => {
    const { projectId, search } = await opened();
    expect(search(projectId, { query: '  ', uiLanguage: 'en' })).toEqual({ ok: true, value: [] });
  });

  it('reports a project that is not open', async () => {
    const { search } = await opened();
    expect(search('nope', { query: 'he', uiLanguage: 'en' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});

describe('chooseTargetLocale', () => {
  it("makes a language the project's target, by its catalog tag, with its direction", async () => {
    const { projectId, choose, sessions } = await opened({});
    expect(choose(projectId, 'PT-br')).toEqual({
      ok: true,
      value: { id: 'pt-BR', direction: 'ltr' },
    });
    expect(sessions.get(projectId)?.targetLocale).toEqual({ id: 'pt-BR', direction: 'ltr' });
  });

  it('accepts an alias and the project’s own codes', async () => {
    const { projectId, choose } = await opened();
    expect(choose(projectId, 'sr-el')).toEqual({
      ok: true,
      value: { id: 'sr-Latn', direction: 'ltr' },
    });
    expect(choose(projectId, 'qaa-x-folder')).toMatchObject({
      ok: true,
      value: { id: 'qaa-x-folder' },
    });
  });

  it.each<[string, string, unknown]>([
    [
      'a code no catalog knows',
      'xx-unknown',
      { code: 'workspace.unknown-language', language: 'xx-unknown' },
    ],
    ['malformed input', 'pt_BR!', { code: 'workspace.unknown-language', language: 'pt_BR!' }],
    ['the source language', 'EN', { code: 'workspace.target-is-source', language: 'en' }],
  ])('refuses %s and keeps the previous target', async (_description, language, error) => {
    const { projectId, choose, sessions } = await opened();
    expect(choose(projectId, language)).toEqual({ ok: false, error });
    expect(sessions.get(projectId)?.targetLocale?.id).toBe('he');
  });

  it('reports a project that is not open', async () => {
    const { choose } = await opened();
    expect(choose('nope', 'he')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});
