// SPDX-License-Identifier: GPL-3.0-or-later
import { FakeFolderPicker, FakeProjectFilesOpener } from './fakes.ts';
import { describeFolderPickerContract } from './folder-picker-contract.ts';
import { describeProjectFilesOpenerContract } from './project-files-opener-contract.ts';

describeFolderPickerContract('FakeFolderPicker', (answer) => new FakeFolderPicker(answer));

describeProjectFilesOpenerContract('FakeProjectFilesOpener', (tree, folderName) => {
  const folder = `/projects/${folderName}`;
  return Promise.resolve({
    opener: new FakeProjectFilesOpener({ [folder]: tree }),
    folder,
    missing: '/projects/nope',
  });
});
