// SPDX-License-Identifier: GPL-3.0-or-later
// The in-memory project files double as the project writer in tests and the UI harness.
import { InMemoryProjectFiles } from '#domain-testing/formats';
import { PROJECT_ROOT } from '#kernel/project-path';
import { describeProjectWriterContract } from './project-writer-contract.ts';

describeProjectWriterContract('InMemoryProjectFiles', (tree) => {
  const files = new InMemoryProjectFiles(tree);
  return Promise.resolve({
    writer: files,
    contents: async () => {
      const listed = await files.list(PROJECT_ROOT);
      if (!listed.ok) throw new Error('test setup: list');
      const entries: [string, string][] = [];
      for (const path of listed.value) {
        const text = await files.readText(path);
        if (text.ok) entries.push([path, text.value]);
      }
      return Object.fromEntries(entries);
    },
  });
});
