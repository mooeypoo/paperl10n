// SPDX-License-Identifier: GPL-3.0-or-later
// The harness end to end in a DOM: the real UI, the real app wiring, and the real plugin
// fixtures (loaded by the same glob import as the harness page), through the cloning transport.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FIXTURE, HARNESS_MARKER, startHarness } from './harness';
import { fixtureProjects } from './fixture-projects';

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
    expect(source?.textContent).toContain('Lantern is free software');
    expect(target?.textContent).toContain("This page isn't translated yet.");
  });

  it('shows the real error for an unknown fixture', async () => {
    const element = await openWith('format-stub/nope');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelectorAll('section[lang]')).toHaveLength(0);
  });
});
