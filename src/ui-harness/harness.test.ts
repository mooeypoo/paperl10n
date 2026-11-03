// SPDX-License-Identifier: GPL-3.0-or-later
// The harness end to end in a DOM: the real UI, the real app wiring, and the real plugin
// fixtures (loaded by the same glob import as the harness page), through the cloning transport.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FIXTURE, HARNESS_MARKER, startHarness } from './harness';
import { fixtureProjects } from './fixture-projects';

/** A pane's editor text: the editors live in shadow roots (ui/editor/markdown-editor.ts). */
const textWithEditors = (pane: Element | undefined) =>
  pane?.querySelector('.markdown-editor')?.shadowRoot?.querySelector('.cm-content')?.textContent;

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

async function openWith(fixture?: string): Promise<Element> {
  const element = document.createElement('div');
  document.body.append(element);
  const app = startHarness(element, fixtureProjects, fixture === undefined ? {} : { fixture });
  unmount = () => {
    app.unmount();
  };
  const open = [...element.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === 'Open folder…',
  );
  if (open === undefined) throw new Error('no "Open folder…" button');
  open.click();
  // The use cases read in-memory files, so a few rounds of promises settle everything.
  for (let i = 0; i < 5; i++) await flushPromises();
  return element;
}

describe('the UI harness', () => {
  it('loads the plugin fixtures and the sample projects, including the default one', () => {
    expect(fixtureProjects.has('format-stub/basic')).toBe(true);
    expect(fixtureProjects.has(DEFAULT_FIXTURE)).toBe(true);
    expect(fixtureProjects.get(DEFAULT_FIXTURE)?.['paperl10n.config.json']).toContain(
      'format-stub',
    );
  });

  it('opens the basic fixture and shows both panes with their lang and dir', async () => {
    const element = await openWith('format-stub/basic');
    const panes = [...element.querySelectorAll('section')];
    expect(panes.map((pane) => [pane.getAttribute('lang'), pane.getAttribute('dir')])).toEqual([
      ['en', 'ltr'],
      ['he', 'rtl'],
    ]);
    expect(element.textContent).toContain('en/guide/getting-started.md');
    expect(element.textContent).toContain('he/guide/getting-started.md');
    expect(document.documentElement.hasAttribute(`data-${HARNESS_MARKER}`)).toBe(true);
  });

  it('opens the sample project by default and lists all its pages', async () => {
    const element = await openWith();
    const pages = [...element.querySelectorAll('nav .pages-list bdi')].map(
      (item) => item.textContent,
    );
    expect(pages).toHaveLength(8);
    expect(pages).toContain('blog/2026-10-lantern-2');
    const [source, target] = [...element.querySelectorAll('section[lang]')];
    expect(target?.textContent).toContain('docs/he/about.md');
    // The first page (about) is read and parsed for real: its English text, and no translation yet.
    expect(textWithEditors(source)).toContain('Lantern is free software');
    expect(target?.textContent).toContain("This page isn't translated yet.");
  });

  it('opens a banana-i18n extension and lists its catalogs with their progress', async () => {
    const element = await openWith('catalog-banana/mediawiki-extension');
    expect(element.querySelector('.header-project')?.textContent).toContain('banana-i18n');
    const catalogs = [...element.querySelectorAll('nav .catalogs-item')].map((item) =>
      [...item.children].map((part) => part.textContent.trim()),
    );
    // No status file: the existing Hebrew translations are drafts, none up to date yet.
    expect(catalogs).toEqual([
      ['i18n', '0 of 5 up to date'],
      ['i18n/api', '0 of 2 up to date'],
    ]);
    expect(element.querySelectorAll('section[lang]')).toHaveLength(0);
    // No pages: it opens on the first catalog, read through the real plugin.
    expect(element.querySelector('.catalog-title')?.textContent).toBe('i18n');
    const rows = [...element.querySelectorAll('.catalog-messages tr[data-row]')];
    expect(rows.map((row) => row.querySelector('bdi')?.textContent)).toEqual([
      'example-desc',
      'example-count',
      'example-link',
      'example-bold',
      'example-last',
    ]);
    expect(rows[1]?.querySelector('.message-token')?.textContent).toBe(
      '{{PLURAL:$1|is one example|are $1 examples}}',
    );
    expect(element.querySelector('.catalog-orphans li bdi')?.textContent).toBe('example-removed');
  });

  it('opens a VitePress site, its config read from .vitepress/', async () => {
    expect(fixtureProjects.get('format-vitepress/root-locale')).toHaveProperty([
      '.vitepress/config.mts',
    ]);
    const element = await openWith('format-vitepress/root-locale');
    expect(element.querySelector('.header-project')?.textContent).toContain('VitePress');
    const pages = [...element.querySelectorAll('nav .pages-list bdi')].map(
      (item) => item.textContent,
    );
    // Not `public/notes.md` or `.vitepress/theme/notes.md`, nor the Hebrew or Portuguese pages.
    expect(pages).toEqual(['guide/getting-started', 'index', 'reference/api']);
    const [, target] = [...element.querySelectorAll('section[lang]')];
    expect([target?.getAttribute('lang'), target?.getAttribute('dir')]).toEqual(['he', 'rtl']);
  });

  it('opens a gettext project and lists its messages, a plural’s first form shown', async () => {
    const element = await openWith('catalog-gettext/side-by-side');
    expect(element.querySelector('.header-project')?.textContent).toContain('gettext');
    const catalogs = [...element.querySelectorAll('nav .catalogs-item')].map((item) =>
      [...item.children].map((part) => part.textContent.trim()),
    );
    // The fuzzy entry needs review: outdated.
    expect(catalogs).toEqual([['lantern', '0 of 5 up to date  · 1 outdated']]);
    const rows = [...element.querySelectorAll('.catalog-messages tr[data-row]')];
    expect(rows.map((row) => row.querySelector('bdi')?.textContent)).toEqual([
      'Lantern',
      'Light %s',
      'menu\u0004Open',
      'Lantern lights up your documents. Press the switch to turn a lamp on, and press it again to turn it off.\nLamps stay lit until you close the window.',
      '%d lamp is lit',
    ]);
    // The flag says `%s` is a placeholder: marked in the source and the translation.
    expect(rows[1]?.querySelectorAll('.message-token')).toHaveLength(2);
    expect(element.querySelector('.catalog-orphans li bdi')?.textContent).toBe('Dim');
  });

  it('shows the real error for an unknown fixture', async () => {
    const element = await openWith('format-stub/nope');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelectorAll('section[lang]')).toHaveLength(0);
  });
});
