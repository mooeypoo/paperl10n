// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { LanguageSuggestionsDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import type { ErrorDto } from '#ipc-contract';
import { memoryPreferences } from '../preferences';
import { error, fakeClient, languages } from '../test-support';
import { useLanguagePicker } from './use-language-picker';

const environment = { preferences: memoryPreferences(), systemLanguages: ['fr-CA'] };

describe('useLanguagePicker', () => {
  it('shows the non-empty suggestion sections in order', async () => {
    const { client } = fakeClient({
      suggest: {
        ok: true,
        value: { inProject: [languages.he], recent: [], suggested: [languages.fr, languages.de] },
      },
    });
    const picker = useLanguagePicker(client, ref('p-1'), ref('en'), environment);
    await picker.refresh();
    expect(picker.sections.value.map((section) => section.id)).toEqual(['inProject', 'suggested']);
    expect(picker.options.value.map((language) => language.tag)).toEqual(['he', 'fr', 'de']);
    expect(picker.loading.value).toBe(false);
  });

  it('searches while there is a query', async () => {
    const { client, calls } = fakeClient();
    const picker = useLanguagePicker(client, ref('p-1'), ref('he'), environment);
    picker.query.value = '  fr ';
    await picker.refresh();
    expect(calls).toEqual(['searchTargetLanguages:p-1:he:fr']);
    expect(picker.sections.value).toEqual([{ id: 'results', languages: [languages.fr] }]);
  });

  it('asks nothing without a project', async () => {
    const { client, calls } = fakeClient();
    await useLanguagePicker(client, ref(null), ref('en'), environment).refresh();
    expect(calls).toEqual([]);
  });

  it('shows only the newest answer', async () => {
    const resolvers: ((value: Result<LanguageSuggestionsDto, ErrorDto>) => void)[] = [];
    const client: PaperLionApi = {
      ...fakeClient().client,
      suggestTargetLanguages: () => new Promise((resolve) => resolvers.push(resolve)),
    };
    const picker = useLanguagePicker(client, ref('p-1'), ref('en'), environment);
    const first = picker.refresh();
    const second = picker.refresh();
    resolvers[1]?.({ ok: true, value: { inProject: [], recent: [], suggested: [languages.de] } });
    await second;
    resolvers[0]?.({ ok: true, value: { inProject: [languages.he], recent: [], suggested: [] } });
    await first;
    expect(picker.options.value.map((language) => language.tag)).toEqual(['de']);
  });

  it('shows an error from the app, and a broken transport as internal.unexpected', async () => {
    const failing = fakeClient({
      suggest: { ok: false, error: error('workspace.unknown-project') },
    });
    const picker = useLanguagePicker(failing.client, ref('p-1'), ref('en'), environment);
    await picker.refresh();
    expect(picker.error.value).toEqual(error('workspace.unknown-project'));

    const broken: PaperLionApi = {
      ...fakeClient().client,
      suggestTargetLanguages: () => Promise.reject(new Error('gone')),
    };
    const brokenPicker = useLanguagePicker(broken, ref('p-1'), ref('en'), environment);
    await brokenPicker.refresh();
    expect(brokenPicker.error.value).toEqual(error('internal.unexpected'));
    expect(brokenPicker.loading.value).toBe(false);
  });
});
