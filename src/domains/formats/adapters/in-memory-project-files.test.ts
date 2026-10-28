// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { InMemoryProjectFiles } from './in-memory-project-files.ts';
import { describeProjectFilesContract } from '../testing/project-files-contract.ts';

describeProjectFilesContract('InMemoryProjectFiles', (tree) =>
  Promise.resolve(new InMemoryProjectFiles(tree)),
);

describe('InMemoryProjectFiles setup', () => {
  it.each([['/abs'], ['../up'], ['']])('rejects an invalid path %j in the tree', (raw) => {
    expect(() => new InMemoryProjectFiles({ [raw]: 'x' })).toThrow('invalid path');
  });
});
