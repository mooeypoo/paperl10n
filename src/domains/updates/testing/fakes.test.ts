// SPDX-License-Identifier: GPL-3.0-or-later
import { FakeUpdateSource } from './fakes.ts';
import { describeUpdateSourceContract } from './update-source-contract.ts';

describeUpdateSourceContract('FakeUpdateSource', (body) =>
  Promise.resolve(new FakeUpdateSource(body)),
);
