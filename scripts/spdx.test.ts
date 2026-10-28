// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { headerFor, headerStatus, withHeader, type HeaderStatus } from './spdx.ts';

describe('headerFor', () => {
  it.each([
    ['src/shared/kernel/result.ts', '// SPDX-License-Identifier: GPL-3.0-or-later'],
    ['eslint.config.js', '// SPDX-License-Identifier: GPL-3.0-or-later'],
    ['scripts/tool.mjs', '// SPDX-License-Identifier: GPL-3.0-or-later'],
    ['scripts/legacy.cjs', '// SPDX-License-Identifier: GPL-3.0-or-later'],
    ['src/ui/App.vue', '<!-- SPDX-License-Identifier: GPL-3.0-or-later -->'],
    ['src/ui/index.html', '<!-- SPDX-License-Identifier: GPL-3.0-or-later -->'],
    ['src/ui/styles/tokens.css', '/* SPDX-License-Identifier: GPL-3.0-or-later */'],
  ])('%s needs %s', (path, header) => {
    expect(headerFor(path)).toBe(header);
  });

  it.each([
    ['package.json'],
    ['README.md'],
    ['LICENSE'],
    ['.gitignore'],
    ['tests/fixtures/project-files/a.ts'],
    ['src/plugins/format-stub/fixtures/basic/en/index.md'],
    ['src/plugins/format-stub/fixtures/basic/theme.css'],
  ])('%s is exempt', (path) => {
    expect(headerFor(path)).toBeUndefined();
  });

  it('only exempts fixtures folders, not plugin source', () => {
    expect(headerFor('src/plugins/format-stub/format-stub.ts')).toBeDefined();
  });
});

describe('headerStatus', () => {
  it.each<[string, HeaderStatus]>([
    ['// SPDX-License-Identifier: GPL-3.0-or-later\ncode', 'ok'],
    ['#!/usr/bin/env node\n// SPDX-License-Identifier: GPL-3.0-or-later\n', 'ok'],
    ['<!doctype html>\n<!-- SPDX-License-Identifier: GPL-3.0-or-later -->\n', 'ok'],
    ['/* SPDX-License-Identifier: GPL-3.0-or-later */', 'ok'],
    ['code\n', 'missing'],
    ['', 'missing'],
    ['a\nb\nc\n// SPDX-License-Identifier: GPL-3.0-or-later', 'missing'],
    ['// SPDX-License-Identifier: MIT\n', 'other-license'],
    ['// SPDX-License-Identifier: GPL-3.0-only\n', 'other-license'],
    ['// SPDX-License-Identifier: GPL-3.0-or-later-ish\n', 'other-license'],
  ])('%j is %s', (content, status) => {
    expect(headerStatus(content)).toBe(status);
  });
});

describe('withHeader', () => {
  const header = '// SPDX-License-Identifier: GPL-3.0-or-later';

  it('puts the header first', () => {
    expect(withHeader('code\n', header)).toBe(`${header}\ncode\n`);
  });

  it('keeps a shebang on the first line', () => {
    expect(withHeader('#!/usr/bin/env node\ncode\n', header)).toBe(
      `#!/usr/bin/env node\n${header}\ncode\n`,
    );
  });

  it('handles a file that is only a shebang', () => {
    expect(withHeader('#!/usr/bin/env node', header)).toBe(`#!/usr/bin/env node\n${header}\n`);
  });

  it('produces content that passes the check', () => {
    expect(headerStatus(withHeader('code\n', header))).toBe('ok');
  });
});
