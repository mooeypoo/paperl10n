// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A message key as a row shows it: control characters (a format may join parts of a key with
 * one, as gettext joins a context to its text with U+0004) as their visible symbols (␄), so a key
 * never reads as two words run together, or hides part of itself.
 */
export function visibleKey(key: string): string {
  // Control characters are what this finds, on purpose.
  // eslint-disable-next-line no-control-regex
  return key.replace(/[\u0000-\u001f]/g, (char) =>
    String.fromCodePoint(0x2400 + char.charCodeAt(0)),
  );
}
