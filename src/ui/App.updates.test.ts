// SPDX-License-Identifier: GPL-3.0-or-later
// Update notices in the UI (ADR 0018), through the real entry point with a fake client.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { fakeClient, updateNotice } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

async function start(answers: Parameters<typeof fakeClient>[0] = {}, uiLocale: 'en' | 'he' = 'en') {
  const fake = fakeClient(answers);
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, fake.client, {
    preferences: memoryPreferences(),
    systemLanguages: ['en-US'],
    uiLocale,
  });
  unmount = () => {
    app.unmount();
  };
  await flushPromises();
  return { ...fake, element };
}

const withNotice = { updates: { automatic: true, notice: updateNotice('0.2.0') } };
const toggle = (element: Element) => element.querySelector<HTMLButtonElement>('.update-toggle');
const panel = (element: Element) =>
  element.querySelector<HTMLElement>('[data-testid="update-panel"]');
const linksIn = (container: Element | null | undefined) =>
  [...(container?.querySelectorAll('a') ?? [])].map((a) => [a.textContent.trim(), a.href]);
function buttonIn(container: Element | null | undefined, text: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

describe('the update notice', () => {
  it('asks main on start, and shows nothing when there is no newer version', async () => {
    const { element, updateCalls } = await start();
    expect(updateCalls).toEqual(['getUpdateStatus']);
    expect(toggle(element)).toBeNull();
  });

  it('shows a quiet button that opens the panel', async () => {
    const { element } = await start(withNotice);
    const button = toggle(element);
    expect(button?.textContent.trim()).toBe('Update available');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(button?.getAttribute('aria-controls')).toBe(panel(element)?.id);
    expect(panel(element)?.style.display).toBe('none');

    button?.click();
    await flushPromises();
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(panel(element)?.style.display).toBe('');
    expect(panel(element)?.querySelector('p')?.textContent).toBe('Paper Lion 0.2.0 is out.');
    expect(linksIn(panel(element))).toEqual([
      ["What's new", 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0'],
      ['Download', 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0'],
    ]);
  });

  it('links to the download page in the interface language', async () => {
    const { element } = await start(withNotice, 'he');
    toggle(element)?.click();
    await flushPromises();
    expect(linksIn(panel(element))[1]).toEqual([
      'הורדה',
      'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0?he',
    ]);
    expect(panel(element)?.querySelector('p')?.textContent).toBe('יצאה גרסה 0.2.0 של Paper Lion.');
  });

  it('"Not now" hides it and tells main which version', async () => {
    const { element, updateCalls } = await start(withNotice);
    toggle(element)?.click();
    await flushPromises();
    buttonIn(panel(element), 'Not now').click();
    await flushPromises();
    expect(toggle(element)).toBeNull();
    expect(updateCalls).toEqual(['getUpdateStatus', 'dismissUpdate:0.2.0']);
  });

  it('closes with Escape, back on its button', async () => {
    const { element } = await start(withNotice);
    toggle(element)?.click();
    await flushPromises();
    panel(element)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(toggle(element)?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle(element));
  });

  it('closes when focus leaves it', async () => {
    const { element } = await start(withNotice);
    toggle(element)?.click();
    await flushPromises();
    const outside = element.querySelector<HTMLElement>('.header-about');
    toggle(element)?.parentElement?.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    await flushPromises();
    expect(toggle(element)?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('updates in the About window', () => {
  const about = () => document.querySelector('[data-testid="about-updates"]');
  const result = () => about()?.querySelector('[data-testid="about-check-result"]');
  const checkbox = () => about()?.querySelector<HTMLInputElement>('input[type="checkbox"]');

  async function openAbout(answers: Parameters<typeof fakeClient>[0] = {}) {
    const started = await start(answers);
    started.element.querySelector<HTMLButtonElement>('.header-about')?.click();
    await flushPromises();
    return started;
  }

  it.each<[string, Parameters<typeof fakeClient>[0], string, number]>([
    [
      'a newer version, with its links',
      { updateChecks: [{ ok: true, value: { kind: 'newer', update: updateNotice('0.3.0') } }] },
      'Paper Lion 0.3.0 is out.',
      2,
    ],
    ['the newest', {}, 'You have the newest version.', 0],
    [
      'no answer',
      { updateChecks: [{ ok: true, value: { kind: 'failed' } }] },
      "Couldn't check for updates. Check your internet connection, or try again later.",
      0,
    ],
  ])('"Check for updates" reports %s', async (_description, answers, message, links) => {
    const { updateCalls } = await openAbout(answers);
    expect(result()?.textContent).toBe('');
    expect(result()?.getAttribute('role')).toBe('status');
    buttonIn(about(), 'Check for updates').click();
    await flushPromises();
    expect(result()?.textContent).toBe(message);
    expect(linksIn(about())).toHaveLength(links);
    expect(updateCalls).toEqual(['getUpdateStatus', 'checkForUpdates', 'getUpdateStatus']);
  });

  it('shows "Checking…" and holds the button while it asks', async () => {
    const { client } = fakeClient();
    let answer: (() => void) | undefined;
    const slow = {
      ...client,
      checkForUpdates: () =>
        new Promise<Awaited<ReturnType<typeof client.checkForUpdates>>>((resolve) => {
          answer = () => {
            resolve({ ok: true, value: { kind: 'newest' } });
          };
        }),
    };
    const element = document.createElement('div');
    document.body.append(element);
    const app = mountApp(element, slow, { preferences: memoryPreferences(), systemLanguages: [] });
    unmount = () => {
      app.unmount();
    };
    await flushPromises();
    element.querySelector<HTMLButtonElement>('.header-about')?.click();
    await flushPromises();
    buttonIn(about(), 'Check for updates').click();
    await flushPromises();
    expect(result()?.textContent).toBe('Checking…');
    expect(buttonIn(about(), 'Check for updates').disabled).toBe(true);
    answer?.();
    await flushPromises();
    expect(buttonIn(about(), 'Check for updates').disabled).toBe(false);
  });

  it('shows the daily check setting, described, and changes it', async () => {
    const { updateCalls } = await openAbout();
    expect(checkbox()?.checked).toBe(true);
    const hint = document.getElementById(checkbox()?.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent.trim()).toBe(
      'Once a day, Paper Lion asks GitHub whether a new version is out. Nothing about you or your projects is sent.',
    );
    const box = checkbox();
    if (box === null || box === undefined) throw new Error('no checkbox');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(updateCalls).toEqual(['getUpdateStatus', 'setAutomaticUpdateChecks:false']);
    expect(checkbox()?.checked).toBe(false);
  });

  it('shows the setting as saved', async () => {
    await openAbout({ updates: { automatic: false, notice: null } });
    expect(checkbox()?.checked).toBe(false);
  });
});
