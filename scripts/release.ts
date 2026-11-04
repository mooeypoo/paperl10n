// SPDX-License-Identifier: GPL-3.0-or-later
// Prepares a release (M6, question 8; the same as Plot Device's): `pnpm release 0.2.0`, or
// `pnpm release 0.2.0 --dry-run` to see the notes without changing anything. It checks that main is
// ready, sets the version, writes the changelog from the commits since the last release, and opens
// a pull request. Write the summary and edit the notes in that pull request; merging it tags the
// release, and CI builds a draft. See docs/development/releasing.md.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changelogSection, insertSection, withAppstreamRelease } from './changelog.ts';
import { releaseProblems, type ReleaseFacts } from './release-checks.ts';

const repository = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = 'package.json';
const METAINFO = 'packaging/io.github.mooeypoo.paperl10n.metainfo.xml';
const CHANGELOG = 'CHANGELOG.md';
/** Commits before M6 have no prefixes; the first release's notes start here (and are rewritten by
 * hand). */
const FIRST_COMMIT = 'f141251ec91fbaf9e81957d8fc491bf67cc54bdb';

const run = (command: string, args: readonly string[]): string =>
  execFileSync(command, args, { cwd: repository, encoding: 'utf8' }).trim();
const tryRun = (command: string, args: readonly string[]): string | null => {
  try {
    return execFileSync(command, args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

function ciConclusion(commit: string): ReleaseFacts['ci'] {
  const runs = JSON.parse(
    tryRun('gh', [
      'run',
      'list',
      '--workflow',
      'ci.yml',
      '--commit',
      commit,
      '--json',
      'status,conclusion',
      '--limit',
      '1',
    ]) ?? '[]',
  ) as { status: string; conclusion: string }[];
  const latest = runs[0];
  if (latest === undefined) return 'none';
  if (latest.status !== 'completed') return 'running';
  return latest.conclusion === 'success' ? 'success' : 'failed';
}

function gatherFacts(version: string | undefined): ReleaseFacts & { subjects: string[] } {
  tryRun('git', ['fetch', '--quiet', '--tags', 'origin', 'main']);
  const head = run('git', ['rev-parse', 'HEAD']);
  const lastTag = tryRun('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
  const range = lastTag === null ? `${FIRST_COMMIT}^..HEAD` : `${lastTag}..HEAD`;
  const subjects = run('git', ['log', '--no-merges', '--reverse', '--format=%s', range])
    .split('\n')
    .filter(Boolean);
  return {
    version,
    branch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    uncommitted: run('git', ['status', '--porcelain']) !== '',
    upToDate: tryRun('git', ['rev-parse', 'origin/main']) === head,
    lastTag,
    packageVersion: (
      JSON.parse(readFileSync(`${repository}${PACKAGE}`, 'utf8')) as { version: string }
    ).version,
    ci: ciConclusion(head),
    changes: subjects.length,
    subjects,
  };
}

const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

function pullRequestBody(version: string, lastTag: string | null): string {
  return `Release notes for Paper Lion ${version}, written from the ${lastTag === null ? 'commits since M6 (the first release: rewrite them by hand, for translators)' : `commits since ${lastTag}`}.

Before merging:

- [ ] **Write the summary** in \`CHANGELOG.md\`, replacing the \`<!-- Summary … -->\` line: two or three sentences for translators.
- [ ] **Edit the lines** so each makes sense to a translator: reword, merge, or drop them.

Merging tags \`v${version}\`. CI then builds the AppImage, the \`.deb\`, and the Windows installer and attaches them, with the notes, \`SHA256SUMS\`, and \`latest.json\`, to a **draft** release. Try the files from the draft, then publish it: that's when update notices reach earlier copies. Never mark it "Pre-release".`;
}

function main(): void {
  const [version, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes('--dry-run');
  const facts = gatherFacts(version);
  const problems = releaseProblems(facts);
  const section = changelogSection({
    version: version ?? '?',
    date: today(),
    subjects: facts.subjects,
    since: facts.lastTag,
  });

  if (dryRun) {
    console.log(section);
    console.log(
      problems.length > 0
        ? `Not ready:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
        : 'Ready to release.',
    );
    return;
  }
  if (problems.length > 0 || version === undefined) {
    console.error(`Not ready to release ${version ?? ''}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const path = (file: string) => `${repository}${file}`;
  const manifest = readFileSync(path(PACKAGE), 'utf8');
  writeFileSync(path(PACKAGE), manifest.replace(/"version": "[^"]*"/, `"version": "${version}"`));
  writeFileSync(
    path(METAINFO),
    withAppstreamRelease(readFileSync(path(METAINFO), 'utf8'), { version, date: today() }),
  );
  const changelog = existsSync(path(CHANGELOG)) ? readFileSync(path(CHANGELOG), 'utf8') : null;
  writeFileSync(path(CHANGELOG), insertSection(changelog, section));

  const branch = `release/v${version}`;
  run('git', ['switch', '-c', branch]);
  run('git', ['add', PACKAGE, METAINFO, CHANGELOG]);
  run('git', ['commit', '-m', `release: ${version}`]);
  run('git', ['push', '-u', 'origin', branch]);
  const url = run('gh', [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    branch,
    '--title',
    `release: ${version}`,
    '--body',
    pullRequestBody(version, facts.lastTag),
  ]);
  console.log(`The release pull request is open: ${url}`);
  console.log('Write the summary and edit the notes there, then merge it.');
}

main();
