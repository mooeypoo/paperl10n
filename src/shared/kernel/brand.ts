// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A nominal type: `Brand<string, 'ProjectPath'>` is a string that has passed a validating
 * constructor. Plain strings can't be passed where a branded one is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
