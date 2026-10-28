// SPDX-License-Identifier: GPL-3.0-or-later
// Checks that every source file starts with the project's SPDX license line.
// Usage: node scripts/check-spdx.ts [--fix]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { headerFor, headerStatus, withHeader } from './spdx.ts';

const fix = process.argv.includes('--fix');

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((path) => path !== '' && existsSync(path));

const problems: string[] = [];
let fixed = 0;

for (const path of files) {
  const header = headerFor(path);
  if (header === undefined) continue;

  const content = readFileSync(path, 'utf8');
  const status = headerStatus(content);
  if (status === 'ok') continue;

  if (status === 'missing' && fix) {
    writeFileSync(path, withHeader(content, header));
    fixed++;
  } else if (status === 'missing') {
    problems.push(`${path}: missing "${header}"`);
  } else {
    problems.push(`${path}: has a different SPDX license identifier (fix it by hand)`);
  }
}

if (fixed > 0) console.log(`Added SPDX headers to ${String(fixed)} file(s).`);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    `\n${String(problems.length)} file(s) without the SPDX header. Run \`pnpm lint:fix\` to add missing headers.`,
  );
  process.exitCode = 1;
}
