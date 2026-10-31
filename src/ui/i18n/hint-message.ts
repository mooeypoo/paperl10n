// SPDX-License-Identifier: GPL-3.0-or-later
import type { PreservationHintDto } from '#ipc-contract';
import { isolated } from './i18n';

/** The message key for a hint's side: `link`, `missing` → `paperl10n-hint-missing-link`. */
export function hintMessageKey(
  kind: PreservationHintDto['kind'],
  side: 'missing' | 'extra',
): string {
  return `paperl10n-hint-${side}-${kind}`;
}

/**
 * A hint as sentences, one for each side that has values: "A link only in the source: /guide/".
 * Values are isolated (a link target isn't prose in any language); a code block without a
 * language says so.
 */
export function hintMessages(
  hint: PreservationHintDto,
  t: (key: string, ...params: (string | number)[]) => string,
): string[] {
  const list = (values: readonly string[]) =>
    values
      .map((value) =>
        hint.kind === 'code-block' && value === ''
          ? t('paperl10n-hint-no-language')
          : isolated(value),
      )
      .join(t('paperl10n-hint-separator'));
  return (['missing', 'extra'] as const).flatMap((side) => {
    const values = hint[side];
    return values.length === 0
      ? []
      : [t(hintMessageKey(hint.kind, side), values.length, list(values))];
  });
}
