// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { aliasHint, resolveRelative, unitOf } from './units.ts';

describe('unitOf', () => {
  it.each<[string, string | undefined]>([
    ['src/domains/formats/domain/format-id.ts', 'domains/formats'],
    ['src/domains/formats/index.ts', 'domains/formats'],
    ['src/plugins/format-stub/index.ts', 'plugins/format-stub'],
    ['src/plugins/format-stub/fixtures/basic/x.ts', 'plugins/format-stub'],
    ['src/shared/kernel/result.ts', 'shared/kernel'],
    ['src/shared/ipc-contract/index.ts', 'shared/ipc-contract'],
    ['src/ui-harness/main.ts', 'ui-harness'],
    ['src/app/composition-root.ts', 'app'],
    ['src/main/index.ts', 'main'],
    ['src/preload/index.ts', 'preload'],
    ['src/ui/components/Pane.vue', 'ui'],
    ['tests/architecture/boundaries.test.ts', undefined],
    ['scripts/spdx.ts', undefined],
    ['src/misc/x.ts', undefined],
  ])('%s → %s', (path, unit) => {
    expect(unitOf(path)).toBe(unit);
  });
});

describe('resolveRelative', () => {
  it.each([
    ['src/domains/a/application/x.ts', './y.ts', 'src/domains/a/application/y.ts'],
    ['src/domains/a/application/x.ts', '../domain/y.ts', 'src/domains/a/domain/y.ts'],
    ['src/domains/a/application/x.ts', '../../b/index.ts', 'src/domains/b/index.ts'],
    [
      'src/domains/a/domain/x.ts',
      '../../../shared/kernel/result.ts',
      'src/shared/kernel/result.ts',
    ],
  ])('%s + %s → %s', (from, specifier, expected) => {
    expect(resolveRelative(from, specifier)).toBe(expected);
  });
});

describe('aliasHint', () => {
  it.each([
    ['domains/formats', '#domains/formats'],
    ['shared/kernel', '#kernel/<module>'],
    ['shared/ipc-contract', '#ipc-contract'],
    ['plugins/format-stub', '#plugins/format-stub (only from src/app/)'],
    ['ui', 'a # alias'],
  ])('%s → %s', (unit, hint) => {
    expect(aliasHint(unit)).toBe(hint);
  });
});
