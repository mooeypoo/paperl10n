// SPDX-License-Identifier: GPL-3.0-or-later
// Test support for the `formats` domain: fakes and contract suites. Only tests import this,
// as `#domain-testing/formats`.
export { InMemoryProjectFiles, type FileTree } from './in-memory-project-files.ts';
export { describeProjectFilesContract } from './project-files-contract.ts';
export { detects, fakeDocumentPlugin, fakeManifest } from './fake-plugins.ts';
