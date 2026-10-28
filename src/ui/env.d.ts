// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="vite/client" />
import type { PaperLionApi } from '#ipc-contract';

declare global {
  interface Window {
    /** Exposed by the preload (src/preload/index.ts). Only src/ui/main.ts reads it. */
    readonly paperl10n: PaperLionApi;
  }
}

export {};
