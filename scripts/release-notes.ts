// SPDX-License-Identifier: GPL-3.0-or-later
// The release workflows' helper (M6, question 8; the same as Plot Device's). From the repository root:
//   node scripts/release-notes.ts check-commits <base>..<head>   every commit has a known prefix
//   node scripts/release-notes.ts check <version>                 the notes are ready to publish
//   node scripts/release-notes.ts notes <version>                 the notes, for the GitHub release
//   node scripts/release-notes.ts latest <version>                latest.json, for update notices
//   node scripts/release-notes.ts metainfo <version>              puts the notes in the Linux metadata
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appstreamDescription,
  commitsWithoutPrefix,
  dateFor,
  latestJson,
  notesProblems,
  PREFIXES,
  sectionFor,
  withAppstreamRelease,
} from './changelog.ts';

const repository = fileURLToPath(new URL('..', import.meta.url));
const METAINFO = `${repository}packaging/io.github.mooeypoo.paperl10n.metainfo.xml`;
const [command, argument = ''] = process.argv.slice(2);
const changelog = () => readFileSync(`${repository}CHANGELOG.md`, 'utf8');

function fail(lines: readonly string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function readyNotes(version: string): { section: string; date: string } {
  const text = changelog();
  const problems = notesProblems(text, version);
  const section = sectionFor(text, version);
  const date = dateFor(text, version);
  if (problems.length > 0 || section === null || date === null) fail(problems);
  return { section, date };
}

switch (command) {
  case 'check-commits': {
    const subjects = execFileSync('git', ['log', '--no-merges', '--format=%s', argument], {
      cwd: repository,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const missing = commitsWithoutPrefix(subjects);
    if (missing.length > 0) {
      fail([
        `These commits need a prefix (${PREFIXES.join(', ')}). feat:, fix:, and perf: lines become release notes, so write them for translators:`,
        ...missing.map((subject) => `  ${subject}`),
      ]);
    }
    console.log(`${String(subjects.length)} commits, all with a prefix.`);
    break;
  }
  case 'check':
    readyNotes(argument);
    console.log(`The notes for ${argument} are ready.`);
    break;
  case 'notes':
    process.stdout.write(`${readyNotes(argument).section}\n`);
    break;
  case 'latest':
    process.stdout.write(
      `${JSON.stringify(latestJson({ version: argument, date: readyNotes(argument).date }), null, 2)}\n`,
    );
    break;
  case 'metainfo': {
    const { section, date } = readyNotes(argument);
    const description = appstreamDescription(section);
    writeFileSync(
      METAINFO,
      withAppstreamRelease(readFileSync(METAINFO, 'utf8'), {
        version: argument,
        date,
        description,
      }),
    );
    console.log(`The Linux metadata has the notes for ${argument}.`);
    break;
  }
  case undefined:
  default:
    fail([
      'Usage: node scripts/release-notes.ts check-commits|check|notes|latest|metainfo <argument>',
    ]);
}
