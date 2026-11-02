// SPDX-License-Identifier: GPL-3.0-or-later
import type { MessageWarningDto } from '#ipc-contract';
import { isolated } from './i18n';

/**
 * A message's warning as a sentence, in the same words as a page's hints: "A parameter only in
 * the source: $1". Values are isolated (`$1` isn't prose in any language); a tag shows with its
 * angle brackets, and a gender choice without a parameter is the current user's.
 */
export function warningMessage(
  warning: MessageWarningDto,
  t: (key: string, ...params: (string | number)[]) => string,
): string {
  if (warning.kind === 'unbalanced') {
    return t(
      warning.brackets === '{}'
        ? 'paperl10n-warning-unbalanced-braces'
        : 'paperl10n-warning-unbalanced-brackets',
    );
  }
  const side = warning.kind === 'missing' ? 'missing' : 'extra';
  if (warning.token === 'gender' && warning.value === '') {
    return t(`paperl10n-warning-${side}-gender-user`);
  }
  const value = warning.token === 'tag' ? `<${warning.value}>` : warning.value;
  return t(`paperl10n-warning-${side}-${warning.token}`, isolated(value));
}
