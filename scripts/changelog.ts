// SPDX-License-Identifier: GPL-3.0-or-later
// The changelog and release notes (M6, question 8; the same as Plot Device's), built from commit
// messages: `feat:`, `fix:`, and `perf:` commits are what translators notice, so they become the
// release notes; everything else (docs, tests, CI) is left out. A person adds a short summary to
// each version before it's tagged. Pure: the commands are release.ts and release-notes.ts.

/** Commit prefixes in use. Every commit in a pull request needs one, so nothing falls out of the
 * changelog by accident (AGENTS.md). */
export const PREFIXES = [
  'feat',
  'fix',
  'perf',
  'docs',
  'test',
  'ci',
  'build',
  'style',
  'dev',
  'refactor',
  'chore',
  'release',
] as const;

/** The prefixes translators see, in the order their groups appear. */
export const GROUPS = [
  { prefix: 'feat', heading: 'New' },
  { prefix: 'fix', heading: 'Fixed' },
  { prefix: 'perf', heading: 'Faster' },
] as const;

/** Stands where the summary goes until someone writes it; tagging refuses a version that still has it. */
export const SUMMARY_PLACEHOLDER =
  '<!-- Summary: two or three sentences for translators, about what this version means for their work. -->';

export const CHANGELOG_HEADER = `# What's new in Paper Lion

Each version starts with a short summary, then what's new, what's fixed, and what's faster.
`;

export const REPOSITORY = 'https://github.com/mooeypoo/paperl10n';

/** Starts the line linking to every commit in a version, for developers. Left out of the Linux metadata. */
export const ALL_CHANGES = 'All changes, for developers:';

const COMMIT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<description>\S.*)$/;

export interface ParsedCommit {
  readonly type: string;
  readonly description: string;
}

/** A commit subject's parts, or `null` when it has no `type:` prefix. */
export function parseCommit(subject: string): ParsedCommit | null {
  const groups = COMMIT.exec(subject.trim())?.groups;
  return groups?.type === undefined || groups.description === undefined
    ? null
    : { type: groups.type, description: groups.description.trim() };
}

const known = (type: string | undefined): boolean =>
  (PREFIXES as readonly (string | undefined)[]).includes(type);

/** Subjects without a known prefix. Merge commits are left out before this is called (`git log --no-merges`). */
export function commitsWithoutPrefix(subjects: readonly string[]): string[] {
  return subjects.filter((subject) => !known(parseCommit(subject)?.type));
}

const capitalised = (text: string): string =>
  text.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());

/**
 * A version's section: heading, summary placeholder, then one group per kind of change, then a
 * link to every commit since the tag `since` (none for the first release). `subjects` are oldest
 * first; a line repeated by several commits appears once.
 */
export function changelogSection({
  version,
  date,
  subjects,
  since = null,
}: {
  version: string;
  date: string;
  subjects: readonly string[];
  since?: string | null;
}): string {
  const groups = GROUPS.flatMap(({ prefix, heading }) => {
    const lines = [
      ...new Set(
        subjects
          .map(parseCommit)
          .filter((commit) => commit?.type === prefix)
          .map((commit) => `- ${capitalised(commit?.description ?? '')}`),
      ),
    ];
    return lines.length > 0 ? [`### ${heading}\n\n${lines.join('\n')}\n`] : [];
  });
  const all =
    since === null
      ? []
      : [`${ALL_CHANGES} [${since}…v${version}](${REPOSITORY}/compare/${since}...v${version})\n`];
  return [`## ${version} — ${date}\n`, `${SUMMARY_PLACEHOLDER}\n`, ...groups, ...all].join('\n');
}

/** The changelog with a new section at the top, under the header. A missing changelog starts from the header. */
export function insertSection(changelog: string | null, section: string): string {
  const text = changelog?.trim() ? changelog : CHANGELOG_HEADER;
  const first = text.search(/^## /m);
  return first === -1
    ? `${text.trimEnd()}\n\n${section}`
    : `${text.slice(0, first)}${section}\n${text.slice(first)}`;
}

/** A version's section without its heading, or `null` when the changelog has none. */
export function sectionFor(changelog: string, version: string): string | null {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.startsWith(`## ${version} `) || line === `## ${version}`,
  );
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

/** The date in a version's heading (`## 0.3.0 — 2026-11-05`), or `null`. */
export function dateFor(changelog: string, version: string): string | null {
  const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## ${version} `));
  return /\d{4}-\d{2}-\d{2}/.exec(heading ?? '')?.[0] ?? null;
}

/** What stops a version's notes from being published, or an empty list when they're ready. */
export function notesProblems(changelog: string, version: string): string[] {
  const section = sectionFor(changelog, version);
  if (section === null) return [`CHANGELOG.md has no section for ${version}.`];
  const problems: string[] = [];
  // Any comment, not just the placeholder: a half-edited one would reach the release page and the
  // Linux metadata.
  if (section.includes(SUMMARY_PLACEHOLDER)) {
    problems.push(`The summary for ${version} is still the placeholder: write it in CHANGELOG.md.`);
  } else if (/<!--|-->/.test(section)) {
    problems.push(
      `The notes for ${version} still have a <!-- comment -->: remove it from CHANGELOG.md.`,
    );
  } else if (!section.split(/^### /m)[0]?.trim()) {
    problems.push(
      `The notes for ${version} have no summary: write two or three sentences above the first ###.`,
    );
  }
  if (dateFor(changelog, version) === null) {
    problems.push(`The heading for ${version} has no date (## ${version} — YYYY-MM-DD).`);
  }
  return problems;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** A plain `x.y.z` version as numbers, or `null`. The app compares versions the same way (`updates`). */
export function parseVersion(text: string): [number, number, number] | null {
  const match = VERSION.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative, zero, or positive, like a sort comparator. Both must be plain `x.y.z` versions. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parseVersion(a), parseVersion(b)];
  if (left === null || right === null) {
    throw new Error(`Not a plain x.y.z version: ${left === null ? a : b}`);
  }
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/**
 * `latest.json`, attached to every release (read by the `updates` domain). The app asks for it at
 * `${REPOSITORY}/releases/latest/download/latest.json`, which GitHub sends to the newest published
 * release. Links live here, not in the app, so they can move to the documentation site's install
 * page later without breaking copies already installed; until then, the release page.
 */
export function latestJson({ version, date }: { version: string; date: string }) {
  const page = `${REPOSITORY}/releases/tag/v${version}`;
  return { format: 1, version, date, notes: page, download: { en: page } };
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Markdown links and emphasis as plain text, for AppStream, which allows no markup in its paragraphs. */
const plain = (text: string): string =>
  escapeXml(
    text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim(),
  );

/**
 * A version's notes as an AppStream `<description>`, for "What's new" in Linux software centres:
 * the summary as a paragraph, then each group as a paragraph and a list.
 */
export function appstreamDescription(section: string): string {
  const parts: string[] = [];
  for (const block of section.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() && !line.startsWith('<!--'));
    const first = lines[0];
    if (first === undefined || first.startsWith(ALL_CHANGES)) continue;
    if (lines.every((line) => line.startsWith('- '))) {
      parts.push(`<ul>${lines.map((line) => `<li>${plain(line.slice(2))}</li>`).join('')}</ul>`);
    } else if (first.startsWith('### ')) {
      parts.push(`<p>${plain(first.slice(4))}</p>`);
    } else {
      parts.push(`<p>${plain(lines.join(' '))}</p>`);
    }
  }
  return `<description>${parts.join('')}</description>`;
}

/**
 * The metainfo file with this version's `<release>` entry (added if missing) carrying its date and
 * description. Other versions' entries are left as they are.
 */
export function withAppstreamRelease(
  metainfo: string,
  { version, date, description }: { version: string; date: string; description?: string },
): string {
  const entry =
    description === undefined
      ? `<release version="${version}" date="${date}"/>`
      : `<release version="${version}" date="${date}">${description}</release>`;
  const existing = new RegExp(
    `<release version="${version.replace(/\./g, '\\.')}"[^>]*?(?:/>|>[\\s\\S]*?</release>)`,
    'g',
  );
  const found = outsideComments(metainfo, existing);
  if (found !== undefined) {
    return `${metainfo.slice(0, found.index)}${entry}${metainfo.slice(found.index + found[0].length)}`;
  }
  const releases = outsideComments(metainfo, /<releases>(\s*)/g);
  if (releases === undefined) throw new Error('The metainfo file has no <releases> element.');
  const space = releases[1] ?? '';
  const at = releases.index + releases[0].length;
  return `${metainfo.slice(0, at)}${entry}${space}${metainfo.slice(at)}`;
}

/** The first match of `pattern` (global) that isn't inside an XML comment. */
function outsideComments(text: string, pattern: RegExp): RegExpExecArray | undefined {
  const comments = [...text.matchAll(/<!--[\s\S]*?-->/g)].map((comment) => [
    comment.index,
    comment.index + comment[0].length,
  ]);
  for (const match of text.matchAll(pattern)) {
    if (!comments.some(([start = 0, end = 0]) => match.index >= start && match.index < end)) {
      return match;
    }
  }
  return undefined;
}
