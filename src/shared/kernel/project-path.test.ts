// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  PROJECT_ROOT,
  projectPath,
  type InvalidProjectPathReason,
  type ProjectPath,
} from '#kernel/project-path';

describe('projectPath', () => {
  it.each([
    ['docs/index.md', 'docs/index.md'],
    ['./docs//guide/', 'docs/guide'],
    ['a/./b', 'a/b'],
    ['', ''],
    ['.', ''],
    ['./', ''],
    ['עברית/מסמך.md', 'עברית/מסמך.md'],
    ['with space/file name.md', 'with space/file name.md'],
    ['..hidden/file..md', '..hidden/file..md'],
  ])('accepts %j as %j', (input, expected) => {
    expect(projectPath(input)).toEqual({ ok: true, value: expected });
  });

  it.each<[string, InvalidProjectPathReason]>([
    ['/etc/passwd', 'absolute'],
    ['C:/Users/x', 'absolute'],
    ['c:relative-drive', 'absolute'],
    ['../outside', 'parent-segment'],
    ['docs/../../outside', 'parent-segment'],
    ['docs/..', 'parent-segment'],
    ['docs\\index.md', 'backslash'],
    ['docs/\u0000.md', 'control-character'],
    ['docs/line\nbreak.md', 'control-character'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(projectPath(input)).toEqual({
      ok: false,
      error: { code: 'project-path.invalid', reason, input },
    });
  });

  it('PROJECT_ROOT is the empty path', () => {
    expect(PROJECT_ROOT).toBe('');
    expect(projectPath('.')).toEqual({ ok: true, value: PROJECT_ROOT });
  });

  it('is branded: a plain string is not a ProjectPath', () => {
    expectTypeOf<string>().not.toExtend<ProjectPath>();
  });
});
