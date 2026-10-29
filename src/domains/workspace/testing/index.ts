// SPDX-License-Identifier: GPL-3.0-or-later
// Test support for the `workspace` domain. Only tests import this, as `#domain-testing/workspace`.
export { FakeFolderPicker, FakeProjectFilesOpener, unavailableDraftStore } from './fakes.ts';
export { describeFolderPickerContract } from './folder-picker-contract.ts';
export {
  describeProjectFilesOpenerContract,
  type OpenerUnderTest,
} from './project-files-opener-contract.ts';
export { describeProjectSessionsContract } from './project-sessions-contract.ts';
export { describeProjectWriterContract, type WriterUnderTest } from './project-writer-contract.ts';
export { describeDraftStoreContract } from './draft-store-contract.ts';
