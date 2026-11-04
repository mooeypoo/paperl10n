// SPDX-License-Identifier: GPL-3.0-or-later
// Test support for the `updates` domain. Only tests import this, as `#domain-testing/updates`.
export { FakeUpdateSource, unavailableUpdateStateStore } from './fakes.ts';
export { describeUpdateSourceContract } from './update-source-contract.ts';
export { describeUpdateStateStoreContract } from './update-state-store-contract.ts';
