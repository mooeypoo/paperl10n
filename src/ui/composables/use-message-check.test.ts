// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { ErrorDto, MessageCheckDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import { useMessageCheck } from './use-message-check';

type Answer = Result<MessageCheckDto, ErrorDto>;
const checked = (warnings: number): MessageCheckDto => ({
  tokens: [{ kind: 'parameter', start: 0, end: 2 }],
  warnings: Array.from({ length: warnings }, () => ({
    kind: 'missing' as const,
    token: 'parameter' as const,
    value: '$1',
  })),
  forms: null,
});

/** A client whose checks wait until the test answers them, in any order. */
function pending() {
  const requests: { request: unknown; answer: (value: Answer) => void; fail: () => void }[] = [];
  const client = {
    checkMessage: (request: unknown) =>
      new Promise<Answer>((resolve, reject) => {
        requests.push({
          request,
          answer: resolve,
          fail: () => {
            reject(new Error('transport'));
          },
        });
      }),
  } as unknown as PaperLionApi;
  return { client, requests };
}

function start(client: PaperLionApi) {
  const projectId = ref<string | null>('p-1');
  const catalog = ref<string | null>('i18n');
  const open = ref<string | null>(null);
  const text = ref<string | null>('$1 שלום');
  const scope = effectScope();
  const state = scope.run(() =>
    useMessageCheck(client, projectId, catalog, open, () =>
      open.value === null ? null : text.value,
    ),
  );
  if (state === undefined) throw new Error('test setup');
  return { state, projectId, catalog, open, text, scope };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useMessageCheck', () => {
  it('checks a message as soon as it opens, and shows the answer with the text it checked', async () => {
    const { client, requests } = pending();
    const { state, open } = start(client);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(0);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.map((r) => r.request)).toEqual([
      { projectId: 'p-1', catalog: 'i18n', key: 'greeting', text: '$1 שלום' },
    ]);
    requests[0]?.answer({ ok: true, value: checked(1) });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.check.value).toEqual({
      key: 'greeting',
      text: '$1 שלום',
      formTexts: null,
      ...checked(1),
    });
  });

  it('sends the open message’s plural forms, and keeps the forms it checked', async () => {
    const { client, requests } = pending();
    const open = ref<string | null>(null);
    const forms = ref<readonly string[] | null>(['קובץ', '%d קבצים']);
    const scope = effectScope();
    const state = scope.run(() =>
      useMessageCheck(client, ref('p-1'), ref('i18n'), open, () => 'קובץ', {
        currentForms: () => forms.value,
      }),
    );
    open.value = 'files';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests[0]?.request).toEqual({
      projectId: 'p-1',
      catalog: 'i18n',
      key: 'files',
      text: 'קובץ',
      forms: ['קובץ', '%d קבצים'],
    });
    requests[0]?.answer({ ok: true, value: { ...checked(0), forms: [] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(state?.check.value?.formTexts).toEqual(['קובץ', '%d קבצים']);
    // A message without forms sends none.
    forms.value = null;
    state?.refresh();
    await vi.advanceTimersByTimeAsync(200);
    expect(requests[1]?.request).not.toHaveProperty('forms');
    scope.stop();
  });

  it('checks again 0.2 s after the last change', async () => {
    const { client, requests } = pending();
    const { state, open, text } = start(client);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    text.value = 'א';
    state.refresh();
    await vi.advanceTimersByTimeAsync(150);
    text.value = 'אב';
    state.refresh();
    await vi.advanceTimersByTimeAsync(199);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.map((r) => (r.request as { text: string }).text)).toEqual(['$1 שלום', 'אב']);
  });

  it('keeps only the newest answer, and none for a message no longer open', async () => {
    const { client, requests } = pending();
    const { state, open } = start(client);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    state.refresh();
    await vi.advanceTimersByTimeAsync(200);
    requests[1]?.answer({ ok: true, value: checked(2) });
    requests[0]?.answer({ ok: true, value: checked(1) });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.check.value?.warnings).toHaveLength(2);

    open.value = 'farewell';
    await nextTick();
    expect(state.check.value).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    open.value = null;
    await nextTick();
    requests[2]?.answer({ ok: true, value: checked(3) });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.check.value).toBeNull();
  });

  it('shows no check for a message opened again until it’s checked again', async () => {
    const { client, requests } = pending();
    const { state, open } = start(client);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    requests[0]?.answer({ ok: true, value: checked(1) });
    await vi.advanceTimersByTimeAsync(0);
    open.value = 'farewell';
    await nextTick();
    open.value = 'greeting';
    await nextTick();
    expect(state.check.value).toBeNull();
  });

  it('shows nothing new for a check that fails or can’t reach main', async () => {
    const { client, requests } = pending();
    const { state, open } = start(client);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    requests[0]?.answer({ ok: true, value: checked(1) });
    await vi.advanceTimersByTimeAsync(0);
    state.refresh();
    await vi.advanceTimersByTimeAsync(200);
    requests[1]?.answer({
      ok: false,
      error: { code: 'workspace.unknown-message', params: {}, details: [] },
    });
    state.refresh();
    await vi.advanceTimersByTimeAsync(200);
    requests[2]?.fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.check.value?.warnings).toHaveLength(1);
  });

  it('forgets the check when another catalog opens, and stops when its scope ends', async () => {
    const { client, requests } = pending();
    const { state, open, catalog, scope } = start(client);
    open.value = 'greeting';
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    requests[0]?.answer({ ok: true, value: checked(1) });
    await vi.advanceTimersByTimeAsync(0);
    catalog.value = 'api';
    await nextTick();
    expect(state.check.value).toBeNull();
    state.refresh();
    scope.stop();
    await vi.advanceTimersByTimeAsync(1000);
    // The new catalog's check was waiting (replaced by the refresh): neither runs.
    expect(requests).toHaveLength(1);
  });
});
