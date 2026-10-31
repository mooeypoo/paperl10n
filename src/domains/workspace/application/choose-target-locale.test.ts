// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import {
  detects,
  fakeDocumentPlugin,
  type FileTree,
  type InMemoryProjectFiles,
} from '#domain-testing/formats';
import { projectPath } from '#kernel/project-path';
import { err } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import type { ProjectWriter } from './ports/project-writer.ts';
import { createChooseTargetLocale } from './choose-target-locale.ts';
import { createOpenProject } from './open-project.ts';

const CONFIG = 'paperl10n.config.json';
const parsedPath = projectPath(CONFIG);
if (!parsedPath.ok) throw new Error('test setup: config path');
const configPath = parsedPath;
const writeFails: ProjectWriter['writeText'] = (path) =>
  Promise.resolve(err({ code: 'files.unwritable', path }));

/** Opens a project (source `en`, locale folders `he` and `qaa-x-folder`) with this config text. */
async function opened(configText = '{\n  "sourceLocale": "en",\n  "targetLocale": "he"\n}\n') {
  const registry = createFormatRegistry(
    [fakeDocumentPlugin('format-fake', detects('likely'), ['he', 'qaa-x-folder'])],
    { apiVersion: 3 },
  );
  if (!registry.ok) throw new Error('test setup: registry');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const tree: FileTree = { [CONFIG]: configText, 'en/index.md': '# Home\n' };
  const opener = new FakeProjectFilesOpener({ '/p': tree });
  const summary = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener,
    registry: registry.value,
    sessions,
  })();
  if (!summary.ok || summary.value === null) throw new Error('test setup: open');
  const files = opener.opened.get('/p');
  if (files === undefined) throw new Error('test setup: files');
  return {
    projectId: summary.value.projectId,
    sessions,
    files,
    choose: createChooseTargetLocale({ sessions }),
    savedConfig: async () => {
      const text = await files.readText(configPath.value);
      return text.ok ? text.value : undefined;
    },
  };
}

describe('chooseTargetLocale', () => {
  it('makes a language the target by its catalog tag, and saves it, changing nothing else', async () => {
    const { projectId, choose, sessions, savedConfig } = await opened(
      '{\n  "sourceLocale": "en",\n  "targetLocale": "he",\n  "x-team": { "a": 1 }\n}\n',
    );
    expect(await choose(projectId, 'PT-br')).toEqual({
      ok: true,
      value: { id: 'pt-BR', direction: 'ltr' },
    });
    expect(sessions.get(projectId)?.targetLocale).toEqual({ id: 'pt-BR', direction: 'ltr' });
    expect(sessions.get(projectId)?.config.targetLocale).toBe('pt-BR');
    expect(await savedConfig()).toBe(
      '{\n  "sourceLocale": "en",\n  "targetLocale": "pt-BR",\n  "x-team": { "a": 1 }\n}\n',
    );
  });

  it('adds the target to a config without one, after the source', async () => {
    const { projectId, choose, savedConfig } = await opened(
      '{\n  "sourceLocale": "en",\n  "documentFormat": "format-fake"\n}\n',
    );
    expect((await choose(projectId, 'ar')).ok).toBe(true);
    expect(await savedConfig()).toBe(
      '{\n  "sourceLocale": "en",\n  "targetLocale": "ar",\n  "documentFormat": "format-fake"\n}\n',
    );
  });

  it('edits the config as it is on disk now, keeping changes made since opening', async () => {
    const { projectId, choose, files, savedConfig } = await opened();
    await files.writeText(configPath.value, '{ "targetLocale": "he", "added": "by a teammate" }');
    expect((await choose(projectId, 'ar')).ok).toBe(true);
    expect(await savedConfig()).toBe('{ "targetLocale": "ar", "added": "by a teammate" }');
  });

  it('writes nothing when the config already names that target', async () => {
    const { projectId, choose, files } = await opened();
    let writes = 0;
    const original = files.writeText.bind(files);
    files.writeText = (path, text) => {
      writes++;
      return original(path, text);
    };
    expect((await choose(projectId, 'HE')).ok).toBe(true);
    expect(writes).toBe(0);
  });

  it("accepts an alias and the project's own codes", async () => {
    const { projectId, choose } = await opened();
    expect(await choose(projectId, 'sr-el')).toEqual({
      ok: true,
      value: { id: 'sr-Latn', direction: 'ltr' },
    });
    expect(await choose(projectId, 'qaa-x-folder')).toMatchObject({
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
  ])('refuses %s, keeping the target and the config', async (_description, language, error) => {
    const { projectId, choose, sessions, savedConfig } = await opened();
    const before = await savedConfig();
    expect(await choose(projectId, language)).toEqual({ ok: false, error });
    expect(sessions.get(projectId)?.targetLocale?.id).toBe('he');
    expect(await savedConfig()).toBe(before);
  });

  it.each<[string, (files: InMemoryProjectFiles) => Promise<unknown>, unknown]>([
    [
      'a config that became invalid',
      (files) => files.writeText(configPath.value, '{ "targetLocale": 7 }'),
      {
        code: 'workspace.config-invalid',
        problems: [
          { field: 'targetLocale', problem: 'must be a locale id such as "en" or "pt-BR"' },
        ],
      },
    ],
    [
      'a config that is not an object anymore',
      (files) => files.writeText(configPath.value, '[]'),
      {
        code: 'workspace.config-invalid',
        problems: [{ field: '(file)', problem: 'must be a JSON object' }],
      },
    ],
  ])('reports %s, keeping the target', async (_description, change, error) => {
    const { projectId, choose, sessions, files } = await opened();
    await change(files);
    expect(await choose(projectId, 'ar')).toEqual({ ok: false, error });
    expect(sessions.get(projectId)?.targetLocale?.id).toBe('he');
  });

  it('reports a config that can no longer be read, or is gone', async () => {
    const { projectId, choose, sessions } = await opened();
    const project = sessions.get(projectId);
    if (project === undefined) throw new Error('test setup');
    const readFails = (code: 'files.not-found' | 'files.unreadable') => ({
      ...project,
      files: {
        ...project.files,
        readText: () => Promise.resolve(err({ code, path: configPath.value })),
      },
    });
    sessions.update(projectId, readFails('files.not-found'));
    expect(await choose(projectId, 'ar')).toEqual({
      ok: false,
      error: { code: 'workspace.config-missing' },
    });
    sessions.update(projectId, readFails('files.unreadable'));
    expect(await choose(projectId, 'ar')).toEqual({
      ok: false,
      error: {
        code: 'workspace.config-unreadable',
        cause: { code: 'files.unreadable', path: CONFIG },
      },
    });
  });

  it('reports a config that cannot be saved, keeping the target', async () => {
    const { projectId, choose, sessions } = await opened();
    const project = sessions.get(projectId);
    if (project === undefined) throw new Error('test setup');
    sessions.update(projectId, { ...project, writer: { writeText: writeFails } });
    expect(await choose(projectId, 'ar')).toEqual({
      ok: false,
      error: {
        code: 'workspace.config-unwritable',
        cause: { code: 'files.unwritable', path: CONFIG },
      },
    });
    expect(sessions.get(projectId)?.targetLocale?.id).toBe('he');
  });

  it('reports a project that is not open', async () => {
    const { choose } = await opened();
    expect(await choose('nope', 'he')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});
