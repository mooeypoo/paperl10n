// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from '#kernel/brand';

/**
 * An opaque handle for an opened project. The renderer holds this, never a file path: it can only
 * refer to projects the main process opened for it (AGENTS.md, Electron boundary).
 */
export type ProjectId = Brand<string, 'ProjectId'>;
