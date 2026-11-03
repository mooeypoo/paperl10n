// SPDX-License-Identifier: GPL-3.0-or-later
// The About window, through the real entry point with a fake client.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { error, fakeClient } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

function start(client: ReturnType<typeof fakeClient>['client'], uiLocale: 'en' | 'he' = 'en') {
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, client, {
    preferences: memoryPreferences(),
    systemLanguages: ['en-US'],
    uiLocale,
  });
  unmount = () => {
    app.unmount();
  };
  return element;
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.about');
const aboutButton = (element: Element) => {
  const found = element.querySelector<HTMLButtonElement>('.header-about');
  if (found === null) throw new Error('no About button');
  return found;
};
const closeButton = () => {
  const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent.trim() === 'Close',
  );
  if (found === undefined) throw new Error('no Close button');
  return found;
};
const links = () =>
  [...(dialog()?.querySelectorAll('a') ?? [])].map((a) => [a.textContent.trim(), a.href]);

async function openAbout(answers: Parameters<typeof fakeClient>[0] = {}, uiLocale?: 'en' | 'he') {
  const fake = fakeClient(answers);
  const element = start(fake.client, uiLocale);
  aboutButton(element).click();
  await flushPromises();
  return { ...fake, element };
}

describe('the About window', () => {
  it('is closed and empty until asked for, and asks main for nothing before', () => {
    const { client, calls } = fakeClient();
    const element = start(client);
    expect(dialog()?.open).toBe(false);
    expect(dialog()?.textContent.trim()).toBe('');
    expect(aboutButton(element).getAttribute('aria-haspopup')).toBe('dialog');
    expect(aboutButton(element).textContent.trim()).toBe('About');
    expect(calls).toEqual([]);
  });

  it('opens from the header with the version, the license, and where to find more', async () => {
    const { calls } = await openAbout();
    expect(dialog()?.open).toBe(true);
    expect(calls).toEqual(['getAbout']);
    const title = document.getElementById(dialog()?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('Paper Lion');
    expect(dialog()?.querySelector('[data-testid="about-version"]')?.textContent.trim()).toBe(
      'Version 0.1.0',
    );
    expect(dialog()?.textContent).toContain('GNU General Public License, version 3 or later');
    expect(dialog()?.textContent).toContain('Your translations are yours');
    expect(links()).toEqual([
      ['Moriel Schottlender', 'https://moriel.tech/'],
      ['Source code', 'https://github.com/mooeypoo/paperl10n'],
      ['buy me one', 'https://buymeacoffee.com/mooeypoo'],
    ]);
    expect(dialog()?.querySelector('[data-testid="about-coffee"]')?.textContent.trim()).toBe(
      'This lion runs on coffee. ☕ If Paper Lion helps you translate, you can buy me one.',
    );
    expect(document.activeElement).toBe(closeButton());
  });

  it('lists the components and holds the full license', async () => {
    await openAbout();
    const summaries = [...(dialog()?.querySelectorAll('summary') ?? [])].map((s) =>
      s.textContent.trim(),
    );
    expect(summaries).toEqual(['Open-source components (2)', 'The full license (in English)']);
    const rows = [...(dialog()?.querySelectorAll('[data-testid="about-components"] li') ?? [])].map(
      (li) => [...li.querySelectorAll('bdi')].map((part) => part.textContent),
    );
    expect(rows).toEqual([
      ['electron', '45.0.0', 'MIT'],
      ['vue', '3.5.44', 'MIT'],
    ]);
    const license = dialog()?.querySelector('pre');
    expect(license?.textContent).toBe('GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n');
    expect(license?.getAttribute('dir')).toBe('ltr');
    expect(license?.getAttribute('lang')).toBe('en');
  });

  it('leaves out what it could not read', async () => {
    await openAbout({
      about: {
        ok: true,
        value: { name: 'Paper Lion', version: '0.1.0', licenseText: '', components: [] },
      },
    });
    expect(dialog()?.querySelectorAll('details')).toHaveLength(0);
    expect(dialog()?.textContent).toContain('Version 0.1.0');
  });

  it('says so when it could not be read at all, and asks again next time', async () => {
    const { element, calls } = await openAbout({
      about: { ok: false, error: error('internal.unexpected') },
    });
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      "The app's details couldn't be read.",
    );
    expect(dialog()?.querySelector('[data-testid="about-version"]')).toBeNull();
    closeButton().click();
    await flushPromises();
    aboutButton(element).click();
    await flushPromises();
    expect(calls).toEqual(['getAbout', 'getAbout']);
  });

  it('closes with its button and with Escape, asking main only once', async () => {
    const { element, calls } = await openAbout();
    closeButton().click();
    await flushPromises();
    expect(dialog()?.open).toBe(false);
    expect(dialog()?.textContent.trim()).toBe('');

    aboutButton(element).click();
    await flushPromises();
    expect(dialog()?.open).toBe(true);
    dialog()?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await flushPromises();
    expect(dialog()?.open).toBe(false);
    expect(calls).toEqual(['getAbout']);
  });

  it('reads in Hebrew, with the link inside the sentence and the license kept LTR', async () => {
    await openAbout({}, 'he');
    expect(dialog()?.querySelector('[data-testid="about-version"]')?.textContent.trim()).toBe(
      'גרסה 0.1.0',
    );
    expect(dialog()?.querySelector('[data-testid="about-coffee"]')?.textContent.trim()).toBe(
      'האריה הזה רץ על קפה. ☕ אם Paper Lion עוזרת בתרגום, אפשר לקנות לי כוס.',
    );
    expect(dialog()?.querySelector('a[href="https://moriel.tech"]')?.getAttribute('dir')).toBe(
      'ltr',
    );
  });
});
