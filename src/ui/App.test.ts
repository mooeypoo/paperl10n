// SPDX-License-Identifier: GPL-3.0-or-later
// The whole UI through its real entry point (mountApp), with a fake client instead of IPC.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from './mount';
import { documents, error, fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

function start(client: ReturnType<typeof fakeClient>['client'], uiLocale?: 'en' | 'he') {
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, client, uiLocale === undefined ? {} : { uiLocale });
  unmount = () => {
    app.unmount();
  };
  return element;
}

function button(element: Element, text: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

describe('the app', () => {
  it('starts empty, then opens a project and shows both panes', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
    });
    const element = start(client);
    expect(element.textContent).toContain(
      'Open a project folder to see what there is to translate.',
    );

    button(element, 'Open folder…').click();
    await flushPromises();
    const panes = element.querySelectorAll('section');
    expect(panes).toHaveLength(2);
    expect(panes[1]?.getAttribute('dir')).toBe('rtl');
  });

  it('shows an error message from the message files, with its details', async () => {
    const failure = error('workspace.config-invalid', {}, ['targetLocale: is required']);
    const { client } = fakeClient({ open: [{ ok: false, error: failure }] });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The config file has problems:');
    expect(alert?.textContent).toContain('targetLocale: is required');
  });

  it('fills error parameters into the message', async () => {
    const failure = error('workspace.unknown-document-format', { formatId: 'format-nope' });
    const { client } = fakeClient({ open: [{ ok: false, error: failure }] });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('"format-nope"');
  });

  it('sets the page language and direction from the interface language, and mirrors on change', async () => {
    const { client } = fakeClient();
    const element = start(client);
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');

    const select = element.querySelector('select');
    if (select === null) throw new Error('no language selector');
    select.value = 'he';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(button(element, 'פתיחת תיקייה…')).toBeDefined();
  });

  it('can start in Hebrew', () => {
    const { client } = fakeClient();
    const element = start(client, 'he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(element.textContent).toContain('פתחו תיקיית פרויקט');
  });
});
