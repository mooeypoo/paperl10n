// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron app below the transport, on the real disk: the native dialog is the only fake.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElectronAppApi } from './composition-root.ts';

const fixture = new URL('../../plugins/format-stub/fixtures/basic', import.meta.url).pathname;
const about = {
  name: 'Paper Lion',
  version: '1.2.3',
  licenseFile: new URL('../../../LICENSE', import.meta.url).pathname,
  componentsFile: join(tmpdir(), `paperl10n-no-components-${randomUUID()}.json`),
};

describe('createElectronAppApi', () => {
  it('opens a real folder on disk and lists its documents', async () => {
    const api = createElectronAppApi({
      about,
      showFolderDialog: () => Promise.resolve({ canceled: false, filePaths: [fixture] }),
      draftsFolder: join(tmpdir(), `paperl10n-drafts-${randomUUID()}`),
      catalogDraftsFolder: join(tmpdir(), `paperl10n-catalog-drafts-${randomUUID()}`),
      onUnexpected: (method, thrown) => {
        throw new Error(`unexpected in ${method}: ${String(thrown)}`);
      },
    });
    if (!api.ok) throw new Error('test setup');

    const opened = await api.value.openProject();
    expect(opened.ok && opened.value?.documentFormat?.id).toBe('format-stub');
    if (!opened.ok || opened.value === null) return;
    expect(opened.value.projectId).toMatch(/^[0-9a-f-]{36}$/);

    const documents = await api.value.listSourceDocuments({ projectId: opened.value.projectId });
    expect(documents.ok && documents.value.documents.map((d) => d.targetPath)).toEqual([
      'he/guide/getting-started.md',
      'he/index.md',
    ]);
  });

  it('returns null when the dialog is cancelled', async () => {
    const api = createElectronAppApi({
      about,
      showFolderDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
      draftsFolder: join(tmpdir(), `paperl10n-drafts-${randomUUID()}`),
      catalogDraftsFolder: join(tmpdir(), `paperl10n-catalog-drafts-${randomUUID()}`),
      onUnexpected: () => undefined,
    });
    expect(api.ok && (await api.value.openProject())).toEqual({ ok: true, value: null });
  });

  it('reads About from the files it was given', async () => {
    const api = createElectronAppApi({
      about,
      showFolderDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
      draftsFolder: join(tmpdir(), `paperl10n-drafts-${randomUUID()}`),
      catalogDraftsFolder: join(tmpdir(), `paperl10n-catalog-drafts-${randomUUID()}`),
      onUnexpected: () => undefined,
    });
    if (!api.ok) throw new Error('test setup');
    const answer = await api.value.getAbout();
    expect(answer.ok && answer.value.version).toBe('1.2.3');
    expect(answer.ok && answer.value.licenseText).toMatch(/^\s*GNU GENERAL PUBLIC LICENSE/);
    expect(answer.ok && answer.value.components).toEqual([]);
  });
});
