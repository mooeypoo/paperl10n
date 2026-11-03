// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  localeId,
  messageKey,
  projectPath,
  type CatalogFileRole,
  type LocaleId,
  type ParsedCatalog,
} from '#plugin-api';
import { describePluginContract, InMemoryProjectFiles, openFixture } from '#plugin-api/testing';
import { catalogGettext } from './catalog-gettext.ts';
import { plugin } from './index.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

describePluginContract(plugin, {
  folder: new URL('.', import.meta.url).pathname,
  fixtures: [
    {
      name: 'side-by-side',
      root: fixture('side-by-side'),
      sourceLocale: 'en',
      targetLocales: ['he', 'pt-BR', 'ar'],
      detected: true,
    },
    {
      name: 'django',
      root: fixture('django'),
      sourceLocale: 'en',
      targetLocales: ['he', 'ar', 'fr'],
      detected: true,
    },
    {
      name: 'sphinx',
      root: fixture('sphinx'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'template-only',
      root: fixture('template-only'),
      sourceLocale: 'en',
      targetLocales: ['he', 'sr-Latn'],
      detected: true,
    },
    {
      name: 'not-gettext',
      root: fixture('not-gettext'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: false,
    },
  ],
});

const locale = (raw: string): LocaleId => {
  const id = localeId(raw);
  if (!id.ok) throw new Error(`test setup: ${raw}`);
  return id.value;
};

async function layoutOf(name: string, options: Record<string, unknown> = {}) {
  const files = await openFixture(fixture(name));
  const layout = await catalogGettext.open({ files, sourceLocale: locale('en'), options });
  if (!layout.ok) throw new Error(`test setup: ${JSON.stringify(layout.error)}`);
  const catalogs = await layout.value.listCatalogs();
  if (!catalogs.ok) throw new Error('test setup');
  return { files, layout: layout.value, catalogs: catalogs.value };
}

function parsed(text: string, role: CatalogFileRole = 'target'): ParsedCatalog {
  const result = catalogGettext.parse(text, role);
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** A fixture file's text, by its path under fixtures/ (`side-by-side/po/he.po`). */
async function read(path: string): Promise<string> {
  const [name = '', ...rest] = path.split('/');
  const at = projectPath(rest.join('/'));
  const text = at.ok ? await (await openFixture(fixture(name))).readText(at.value) : null;
  if (text?.ok !== true) throw new Error(`test setup: ${path}`);
  return text.value;
}

describe('catalog-gettext detection', () => {
  it.each([
    ['a template', 'side-by-side', 'certain', ['po/he.po', 'po/lantern.pot', 'po/pt_BR.po']],
    [
      'LC_MESSAGES folders',
      'django',
      'certain',
      [
        'myshop/locale/ar/LC_MESSAGES/django.po',
        'myshop/locale/en/LC_MESSAGES/django.po',
        'myshop/locale/en/LC_MESSAGES/djangojs.po',
      ],
    ],
  ])('is sure of a project with %s', async (_description, name, confidence, evidence) => {
    expect(await catalogGettext.detect(await openFixture(fixture(name)))).toEqual({
      matches: true,
      confidence,
      evidence,
    });
  });

  it('is likely for PO files alone, and no match without any', async () => {
    expect(await catalogGettext.detect(new InMemoryProjectFiles({ 'i18n/he.po': '' }))).toEqual({
      matches: true,
      confidence: 'likely',
      evidence: ['i18n/he.po'],
    });
    expect(await catalogGettext.detect(await openFixture(fixture('not-gettext')))).toEqual({
      matches: false,
    });
  });
});

describe('catalog-gettext layouts', () => {
  it('finds a domain side by side with its template, and names files the way it does', async () => {
    const { layout, catalogs } = await layoutOf('side-by-side');
    expect(catalogs).toEqual([{ key: 'lantern', path: 'po/lantern.pot', locale: 'en' }]);
    expect(layout.locales).toEqual(['en', 'he', 'pt-BR']);
    const [catalog] = catalogs;
    if (catalog === undefined) throw new Error('test setup');
    expect(
      ['en', 'he', 'pt-BR', 'sr-Latn', 'zh-Hans'].map((l) =>
        layout.targetPathFor(catalog, locale(l)),
      ),
    ).toEqual([
      { ok: true, value: 'po/lantern.pot' },
      { ok: true, value: 'po/he.po' },
      { ok: true, value: 'po/pt_BR.po' },
      { ok: true, value: 'po/sr@latin.po' },
      { ok: true, value: 'po/zh_Hans.po' },
    ]);
  });

  it('finds each domain of a folder per locale, its source the source locale’s file', async () => {
    const { layout, catalogs } = await layoutOf('django');
    expect(catalogs.map((c) => [c.key, c.path])).toEqual([
      ['django', 'myshop/locale/en/LC_MESSAGES/django.po'],
      ['djangojs', 'myshop/locale/en/LC_MESSAGES/djangojs.po'],
    ]);
    expect(layout.locales).toEqual(['en', 'ar', 'he']);
    const [django] = catalogs;
    if (django === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(django, locale('pt-BR'))).toEqual({
      ok: true,
      value: 'myshop/locale/pt_BR/LC_MESSAGES/django.po',
    });
  });

  it('finds a template elsewhere by its domain, and a folder per locale from a template alone', async () => {
    const sphinx = await layoutOf('sphinx');
    expect(sphinx.catalogs).toEqual([
      { key: 'index', path: '_build/gettext/index.pot', locale: 'en' },
    ]);
    const [index] = sphinx.catalogs;
    if (index === undefined) throw new Error('test setup');
    expect(sphinx.layout.targetPathFor(index, locale('he'))).toEqual({
      ok: true,
      value: 'locales/he/LC_MESSAGES/index.po',
    });
    const files = new InMemoryProjectFiles({ 'locale/django.pot': 'msgid "a"\nmsgstr ""\n' });
    const opened = await catalogGettext.open({ files, sourceLocale: locale('en'), options: {} });
    const listed = opened.ok ? await opened.value.listCatalogs() : null;
    const [catalog] = listed?.ok === true ? listed.value : [];
    if (!opened.ok || catalog === undefined) throw new Error('test setup');
    expect(opened.value.targetPathFor(catalog, locale('he'))).toEqual({
      ok: true,
      value: 'locale/he/LC_MESSAGES/django.po',
    });
  });

  it('doesn’t guess between two templates of one domain', async () => {
    const files = new InMemoryProjectFiles({
      'locales/he/LC_MESSAGES/index.po': '',
      'a/index.pot': '',
      'b/index.pot': '',
    });
    const opened = await catalogGettext.open({ files, sourceLocale: locale('en'), options: {} });
    const listed = opened.ok ? await opened.value.listCatalogs() : null;
    const catalogs = listed?.ok === true ? listed.value : [];
    // Each template is a catalog of its own folder; the locale folders have no source to pair with.
    expect(catalogs.map((c) => c.key)).toEqual(['a/index', 'b/index']);
    const [first] = catalogs;
    if (!opened.ok || first === undefined) throw new Error('test setup');
    expect(opened.value.targetPathFor(first, locale('he'))).toEqual({ ok: true, value: 'a/he.po' });
  });

  it('tells two catalogs with one domain apart by their folder', async () => {
    const files = new InMemoryProjectFiles({
      'app/po/app.pot': '',
      'lib/po/app.pot': '',
    });
    const opened = await catalogGettext.open({ files, sourceLocale: locale('en'), options: {} });
    const listed = opened.ok ? await opened.value.listCatalogs() : null;
    expect(listed?.ok === true && listed.value.map((c) => c.key)).toEqual([
      'app/po/app',
      'lib/po/app',
    ]);
  });

  it('leaves out a domain without a template or a source-language file', async () => {
    const files = new InMemoryProjectFiles({ 'locale/he/LC_MESSAGES/x.po': '', 'po/he.po': '' });
    const opened = await catalogGettext.open({ files, sourceLocale: locale('en'), options: {} });
    const listed = opened.ok ? await opened.value.listCatalogs() : null;
    expect(listed).toEqual({ ok: true, value: [] });
  });

  it('looks only in the folders `dirs` names', async () => {
    const { catalogs } = await layoutOf('django', { dirs: ['myshop/locale/en'] });
    expect(catalogs.map((c) => c.key)).toEqual(['django', 'djangojs']);
    const none = await layoutOf('side-by-side', { dirs: ['src'] });
    expect(none.catalogs).toEqual([]);
  });

  it.each([
    [{ domains: ['x'] }, 'unknown option(s): domains'],
    [{ dirs: 'po' }, '"dirs" must list folders inside the project'],
    [{ dirs: [] }, '"dirs" must list folders inside the project'],
    [{ dirs: ['../po'] }, '"dirs" must list folders inside the project'],
  ])('refuses %j', async (options, reason) => {
    const files = await openFixture(fixture('side-by-side'));
    expect(await catalogGettext.open({ files, sourceLocale: locale('en'), options })).toEqual({
      ok: false,
      error: { code: 'formats.invalid-options', reason },
    });
  });
});

describe('catalog-gettext reading', () => {
  it('reads a template’s source text from msgid, and a translation’s from msgstr', async () => {
    const source = parsed(await read('side-by-side/po/lantern.pot'), 'source');
    expect(source.messages.map((m) => [m.key, m.text, m.forms])).toEqual([
      ['Lantern', 'Lantern', undefined],
      ['Light %s', 'Light %s', undefined],
      ['menu\u0004Open', 'Open', undefined],
      [
        'Lantern lights up your documents. Press the switch to turn a lamp on, and press it again to turn it off.\nLamps stay lit until you close the window.',
        'Lantern lights up your documents. Press the switch to turn a lamp on, and press it again to turn it off.\nLamps stay lit until you close the window.',
        undefined,
      ],
      ['%d lamp is lit', '%d lamp is lit', ['%d lamp is lit', '%d lamps are lit']],
    ]);
    expect(source.messages[2]?.documentation).toBe('Shown in the menu bar and in a button.');
    expect(source.messages[1]?.flags).toEqual(['c-format']);
  });

  it('reads review marks, documentation, flags, and forms; never the header or obsolete entries', async () => {
    const hebrew = parsed(await read('side-by-side/po/he.po'));
    expect(hebrew.messages.map((m) => m.key)).not.toContain('');
    expect(hebrew.messages.map((m) => m.key)).not.toContain('Old switch');
    expect(hebrew.messages[0]).toEqual({
      key: 'Lantern',
      text: 'פנסים',
      documentation: "The window's title.",
      needsReview: true,
      previousSource: 'Lanterns',
    });
    expect(hebrew.messages.at(-1)).toEqual({
      key: '%d lamp is lit',
      text: 'מנורה אחת דולקת',
      forms: ['מנורה אחת דולקת', 'שתי מנורות דולקות', '%d מנורות דולקות'],
      flags: ['c-format'],
    });
    // A source has no review marks: they describe a translation.
    expect(parsed(await read('side-by-side/po/he.po'), 'source').messages[0]).not.toHaveProperty(
      'needsReview',
    );
  });

  it.each([
    [
      'a file in another charset',
      'msgid ""\nmsgstr "Content-Type: text/plain; charset=ISO-8859-1\\n"\n',
      'ISO-8859-1',
    ],
    [
      'two entries with one key',
      'msgid "a"\nmsgstr "A"\n\nmsgid "a"\nmsgstr "B"\n',
      'a duplicate entry',
    ],
    ['broken syntax', 'msgid "a"\n', 'msgid without msgstr'],
  ])('refuses %s', (_description, text, reason) => {
    const result = catalogGettext.parse(text, 'target');
    expect(result.ok ? null : result.error.code).toBe('formats.invalid-catalog');
    if (!result.ok && result.error.code === 'formats.invalid-catalog') {
      expect(result.error.reason).toContain(reason);
    }
  });

  it('accepts UTF-8 by any of its names, and a template’s CHARSET placeholder', () => {
    for (const charset of ['UTF-8', 'utf8', 'CHARSET']) {
      const text = `msgid ""\nmsgstr "Content-Type: text/plain; charset=${charset}\\n"\n`;
      expect(catalogGettext.parse(text, 'target').ok, charset).toBe(true);
    }
  });
});

describe('catalog-gettext plural forms', () => {
  const samples = (l: string, target: ParsedCatalog | null) =>
    catalogGettext.pluralForms?.(locale(l), target).map((form) => form.samples);

  it('takes them from the file, else from CLDR, else gettext’s default', async () => {
    const portuguese = parsed(await read('side-by-side/po/pt_BR.po'));
    // The file says two forms (n > 1); CLDR's Portuguese has three.
    expect(samples('pt-BR', portuguese)).toEqual([
      [0, 1],
      [2, 3, 4, 5],
    ]);
    expect(samples('pt-BR', null)).toEqual([
      [0, 1],
      [1000000, 2000000],
      [2, 3, 4, 5],
    ]);
    expect(samples('pt-PT', null)).toEqual([[1], [1000000, 2000000], [0, 2, 3, 4]]);
    expect(samples('ar', null)).toHaveLength(6);
    expect(samples('sr-Latn', null)).toHaveLength(3);
    expect(samples('tlh', null)).toEqual([[1], [0, 2, 3, 4]]);
    // A header without a usable rule (a template's placeholder) falls back too.
    expect(samples('he', parsed(await read('template-only/po/app.pot')))).toEqual([
      [1],
      [2],
      [0, 3, 4, 5],
    ]);
  });

  it('writes a new file’s Plural-Forms from CLDR, and as many forms as it has', async () => {
    const source = parsed(await read('template-only/po/app.pot'), 'source');
    const key = (raw: string) => {
      const k = messageKey(raw);
      if (!k.ok) throw new Error('test setup');
      return k.value;
    };
    const written = catalogGettext.serialize({
      locale: locale('ar'),
      source,
      target: null,
      changes: [{ kind: 'set', key: key('Hello'), text: 'مرحبا' }],
    });
    if (!written.ok) throw new Error('test setup');
    expect(written.value).toContain('"Language: ar\\n"');
    expect(written.value).toContain(
      '"Plural-Forms: nplurals=6; plural=n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : n % "',
    );
    expect(written.value).toContain('msgstr[5] ""');
    expect(parsed(written.value).messages[0]?.text).toBe('مرحبا');
  });
});

describe('catalog-gettext scanning', () => {
  it('scans by the message’s flags: none without it', async () => {
    const [welcome] = parsed(
      await read('django/myshop/locale/en/LC_MESSAGES/django.po'),
      'source',
    ).messages;
    if (welcome === undefined) throw new Error('test setup');
    expect(catalogGettext.placeholders.scan('שלום %(name)s!', welcome)).toEqual([
      { kind: 'parameter', text: '%(name)s', start: 5, end: 13 },
    ]);
    expect(catalogGettext.placeholders.scan('שלום %(name)s!')).toEqual([]);
  });
});
