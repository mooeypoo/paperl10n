// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the app build in out/: it's complete, and it contains no UI harness code (ADR 0015).
// Runs after every `pnpm build`. Usage: node scripts/check-app-build.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { appBuildProblems } from './app-build.ts';

const out = 'out';
const files = new Map<string, string>();
if (existsSync(out)) {
  for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(out, path).split(sep).join('/'), readFileSync(path, 'latin1'));
  }
}

const problems = appBuildProblems(files);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`App build checked: ${String(files.size)} file(s), no UI harness code.`);
}
