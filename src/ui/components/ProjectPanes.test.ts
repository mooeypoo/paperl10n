// SPDX-License-Identifier: GPL-3.0-or-later
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n, i18nKey } from '../i18n/i18n';
import { documents, summary } from '../test-support';
import ProjectPanes from './ProjectPanes.vue';

function render(props: Partial<{ summary: typeof summary; documents: typeof documents }> = {}) {
  return mount(ProjectPanes, {
    props: { summary, documents, ...props },
    global: { provide: { [i18nKey as symbol]: createI18n('en') } },
  });
}

describe('ProjectPanes', () => {
  it('gives each pane the language and direction of its locale', () => {
    const [source, target] = render().findAll('section');
    expect(source?.attributes()).toMatchObject({
      lang: 'en',
      dir: 'ltr',
      'aria-label': 'Source (en)',
    });
    expect(target?.attributes()).toMatchObject({
      lang: 'he',
      dir: 'rtl',
      'aria-label': 'Translation (he)',
    });
  });

  it('lists source paths and target paths, each isolated with bdi', () => {
    const [source, target] = render().findAll('section');
    expect(source?.findAll('li bdi').map((item) => item.text())).toEqual([
      'en/guide/getting-started.md',
      'en/index.md',
    ]);
    expect(target?.findAll('li bdi').map((item) => item.text())).toEqual([
      'he/guide/getting-started.md',
      'he/index.md',
    ]);
  });

  it('shows the project, its format, and a pluralized document count', () => {
    expect(render().text()).toContain('basic · Format: Folder per locale (stub) · 2 documents');
    expect(render({ documents: documents.slice(0, 1) }).text()).toContain('1 document');
  });

  it('says so when there are no documents', () => {
    const wrapper = render({ documents: [] });
    expect(wrapper.findAll('section')).toHaveLength(0);
    expect(wrapper.text()).toContain('No source documents found.');
  });

  it('shows config warnings, marked as English', () => {
    const wrapper = render({
      summary: { ...summary, warnings: ['unknown key "theme" is ignored'] },
    });
    const warning = wrapper.find('.project-warnings li');
    expect(warning.text()).toBe('unknown key "theme" is ignored');
    expect(warning.attributes()).toMatchObject({ lang: 'en', dir: 'ltr' });
  });
});
