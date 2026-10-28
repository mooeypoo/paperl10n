// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A language's own name for itself (its autonym): "English", "עברית", "Português (Brasil)".
 * Language pickers and labels use autonyms, so people find their language whatever the
 * interface language is. Falls back to the id when the runtime doesn't know it.
 */
export function autonym(localeId: string): string {
  try {
    const name = new Intl.DisplayNames([localeId], { type: 'language' }).of(localeId);
    return name === undefined || name === localeId ? localeId : capitalizeFirst(name, localeId);
  } catch {
    return localeId;
  }
}

/** Some languages write their own name in lowercase ("français"); labels start with a capital. */
function capitalizeFirst(name: string, localeId: string): string {
  return name.charAt(0).toLocaleUpperCase(localeId) + name.slice(1);
}
