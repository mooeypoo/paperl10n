// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLatestRelease } from '#domains/updates';
import {
  appstreamDescription,
  changelogSection,
  CHANGELOG_HEADER,
  commitsWithoutPrefix,
  compareVersions,
  dateFor,
  insertSection,
  latestJson,
  notesProblems,
  parseCommit,
  sectionFor,
  SUMMARY_PLACEHOLDER,
  withAppstreamRelease,
} from './changelog.ts';

describe("a version's section, from its commits", () => {
  const subjects = [
    'docs: M7 plan, approved',
    'feat: preview a message\'s plural forms in "Check"',
    'fix: the Hebrew header says פתיחת תיקייה',
    'test: catalog timing',
    'perf: opening very large catalogs',
    'feat(ui): mark a message for review',
    'feat: mark a message for review',
    'M4 C8: catalogs in the sidebar',
  ];

  it('keeps only what translators notice, grouped, in order, without the prefix, capitalized', () => {
    expect(changelogSection({ version: '0.2.0', date: '2026-12-01', subjects })).toBe(
      [
        '## 0.2.0 — 2026-12-01',
        '',
        SUMMARY_PLACEHOLDER,
        '',
        '### New',
        '',
        '- Preview a message\'s plural forms in "Check"',
        '- Mark a message for review',
        '',
        '### Fixed',
        '',
        '- The Hebrew header says פתיחת תיקייה',
        '',
        '### Faster',
        '',
        '- Opening very large catalogs',
        '',
      ].join('\n'),
    );
  });

  it('ends with a link to every commit since the last tag, but not for the first release', () => {
    const later = changelogSection({
      version: '0.2.0',
      date: '2026-12-01',
      subjects,
      since: 'v0.1.0',
    });
    expect(later.trimEnd().split('\n').at(-1)).toBe(
      'All changes, for developers: [v0.1.0…v0.2.0](https://github.com/mooeypoo/paperl10n/compare/v0.1.0...v0.2.0)',
    );
    expect(changelogSection({ version: '0.1.0', date: '2026-11-10', subjects })).not.toContain(
      'All changes',
    );
  });

  it('leaves out a group with nothing in it', () => {
    expect(
      changelogSection({
        version: '0.2.1',
        date: '2026-12-02',
        subjects: ['fix: a typo in Hebrew'],
      }),
    ).not.toContain('### New');
  });
});

describe('the changelog file', () => {
  const older = changelogSection({
    version: '0.1.0',
    date: '2026-11-10',
    subjects: ['feat: About'],
  });
  const newer = changelogSection({
    version: '0.2.0',
    date: '2026-12-01',
    subjects: ['fix: menus'],
  });
  const changelog = insertSection(insertSection(null, older), newer);

  it('starts from the header, and puts the newest version first', () => {
    expect(changelog.startsWith(CHANGELOG_HEADER)).toBe(true);
    expect(changelog.indexOf('## 0.2.0')).toBeLessThan(changelog.indexOf('## 0.1.0'));
  });

  it("reads one version's section back, without its heading or the next version", () => {
    expect(sectionFor(changelog, '0.1.0')).toBe(`${SUMMARY_PLACEHOLDER}\n\n### New\n\n- About`);
    expect(sectionFor(changelog, '0.2.0')).not.toContain('About');
    expect(sectionFor(changelog, '0.5.0')).toBeNull();
    expect(dateFor(changelog, '0.2.0')).toBe('2026-12-01');
    expect(dateFor(changelog, '0.5.0')).toBeNull();
  });

  it("isn't ready to publish until the summary is written", () => {
    expect(notesProblems(changelog, '0.2.0')).toEqual([expect.stringContaining('placeholder')]);
    const written = changelog.replace(SUMMARY_PLACEHOLDER, 'Menus behave.');
    expect(notesProblems(written, '0.2.0')).toEqual([]);
    expect(notesProblems(written, '0.9.0')).toEqual([expect.stringContaining('no section')]);
  });

  it('refuses any comment left in the notes, not only the placeholder', () => {
    const halfEdited = changelog.replace(SUMMARY_PLACEHOLDER, '<!-- Summary: Menus behave. -->');
    expect(notesProblems(halfEdited, '0.2.0')).toEqual([
      expect.stringContaining('<!-- comment -->'),
    ]);
    const leftOver = changelog
      .replace(SUMMARY_PLACEHOLDER, 'Menus behave.')
      .replace('- Menus', '- Menus <!-- reword -->');
    expect(notesProblems(leftOver, '0.2.0')).toEqual([expect.stringContaining('<!-- comment -->')]);
    const unclosed = changelog.replace(SUMMARY_PLACEHOLDER, 'Menus behave. -->');
    expect(notesProblems(unclosed, '0.2.0')).toEqual([expect.stringContaining('<!-- comment -->')]);
  });

  it('refuses notes whose summary was deleted instead of written, or without a date', () => {
    expect(notesProblems(changelog.replace(SUMMARY_PLACEHOLDER, ''), '0.2.0')).toEqual([
      expect.stringContaining('no summary'),
    ]);
    const undated = changelog
      .replace(SUMMARY_PLACEHOLDER, 'Menus behave.')
      .replace('## 0.2.0 — 2026-12-01', '## 0.2.0');
    expect(notesProblems(undated, '0.2.0')).toEqual([expect.stringContaining('no date')]);
  });
});

describe('commit prefixes', () => {
  it('finds commits that would fall out of the changelog', () => {
    expect(
      commitsWithoutPrefix([
        'feat: a',
        'fix(ui): b',
        'feat!: c',
        'release: 0.3.0',
        'build(deps): Bump the minor-and-patch group',
        'M4 C8: d',
        'ui: e',
        'feature: f',
        'fix:g',
        'fix: ',
      ]),
    ).toEqual(['M4 C8: d', 'ui: e', 'feature: f', 'fix:g', 'fix: ']);
  });

  it('reads the type and the description', () => {
    expect(parseCommit('feat(ui)!: plural forms ')).toEqual({
      type: 'feat',
      description: 'plural forms',
    });
    expect(parseCommit('Plural forms')).toBeNull();
  });
});

describe('versions', () => {
  it('compare by number, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
    expect(compareVersions('0.3.0', '0.3.1')).toBeLessThan(0);
  });

  it('must be plain x.y.z', () => {
    expect(() => compareVersions('0.3.0-beta.1', '0.3.0')).toThrow(/0\.3\.0-beta\.1/);
    expect(() => compareVersions('0.3.0', 'v0.3.0')).toThrow(/v0\.3\.0/);
  });
});

describe('latest.json', () => {
  it('points at the release page for the notes and the download, until there is an install page', () => {
    expect(latestJson({ version: '0.2.0', date: '2026-12-01' })).toEqual({
      format: 1,
      version: '0.2.0',
      date: '2026-12-01',
      notes: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0',
      download: { en: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0' },
    });
  });
});

describe('latest.json and the app', () => {
  it('is a file the app reads, naming the same version', () => {
    expect(parseLatestRelease(latestJson({ version: '0.2.0', date: '2026-12-01' }))?.version).toBe(
      '0.2.0',
    );
  });
});

describe('the Linux metadata', () => {
  const metainfo =
    '<component>\n  <releases>\n    <release version="0.1.0" date="2026-11-10"/>\n  </releases>\n</component>\n';

  it('adds a version first, keeping the older ones', () => {
    expect(withAppstreamRelease(metainfo, { version: '0.2.0', date: '2026-12-01' })).toBe(
      '<component>\n  <releases>\n    <release version="0.2.0" date="2026-12-01"/>\n    <release version="0.1.0" date="2026-11-10"/>\n  </releases>\n</component>\n',
    );
  });

  it("fills in an existing version's description, once", () => {
    const added = withAppstreamRelease(metainfo, { version: '0.2.0', date: '2026-12-01' });
    const described = withAppstreamRelease(added, {
      version: '0.2.0',
      date: '2026-12-01',
      description: '<description><p>A</p></description>',
    });
    const again = withAppstreamRelease(described, {
      version: '0.2.0',
      date: '2026-12-01',
      description: '<description><p>B</p></description>',
    });
    expect(again.match(/version="0\.2\.0"/g)).toHaveLength(1);
    expect(again).toContain(
      '<release version="0.2.0" date="2026-12-01"><description><p>B</p></description></release>',
    );
    expect(again).toContain('<release version="0.1.0" date="2026-11-10"/>');
  });

  it('ignores <releases> and <release> mentioned in comments', () => {
    const commented =
      '<!-- `pnpm release` adds each version to <releases>, like <release version="0.2.0" date="x"/>. -->\n<component>\n  <releases>\n  </releases>\n</component>\n';
    const added = withAppstreamRelease(commented, { version: '0.2.0', date: '2026-12-01' });
    expect(added).toBe(
      '<!-- `pnpm release` adds each version to <releases>, like <release version="0.2.0" date="x"/>. -->\n<component>\n  <releases>\n  <release version="0.2.0" date="2026-12-01"/>\n  </releases>\n</component>\n',
    );
    const described = withAppstreamRelease(added, {
      version: '0.2.0',
      date: '2026-12-01',
      description: '<description><p>A</p></description>',
    });
    expect(described.split('\n')[0]).toBe(commented.split('\n')[0]);
    expect(described).toContain('<release version="0.2.0" date="2026-12-01"><description>');
  });

  it("puts the release inside Paper Lion's own metadata file's <releases>", () => {
    const metainfo = readFileSync(
      new URL('../packaging/io.github.mooeypoo.paperl10n.metainfo.xml', import.meta.url),
      'utf8',
    );
    const added = withAppstreamRelease(metainfo, { version: '0.2.0', date: '2026-12-01' });
    const inside = added.slice(added.lastIndexOf('<releases>'), added.indexOf('</releases>'));
    expect(inside).toContain('<release version="0.2.0" date="2026-12-01"/>');
    expect(
      added.replace('<release version="0.2.0" date="2026-12-01"/>', '').replace(/\s+/g, ''),
    ).toBe(metainfo.replace(/\s+/g, ''));
  });

  it('refuses a file without <releases>', () => {
    expect(() => withAppstreamRelease('<component/>', { version: '0.2.0', date: 'x' })).toThrow(
      /no <releases>/,
    );
  });

  it("leaves the developers' link out", () => {
    const section =
      sectionFor(
        changelogSection({
          version: '0.2.0',
          date: '2026-12-01',
          subjects: ['feat: x'],
          since: 'v0.1.0',
        }),
        '0.2.0',
      ) ?? '';
    expect(appstreamDescription(section)).not.toContain('All changes');
  });

  it('turns the notes into paragraphs and lists, with no Markdown or unescaped characters', () => {
    const section = `${SUMMARY_PLACEHOLDER}\n\nCatalogs & [links](https://example.com), *finally*.\n\n### New\n\n- Tags <on> messages\n- Hebrew: תגיות`;
    expect(appstreamDescription(section)).toBe(
      '<description><p>Catalogs &amp; links, finally.</p><p>New</p><ul><li>Tags &lt;on&gt; messages</li><li>Hebrew: תגיות</li></ul></description>',
    );
  });
});
