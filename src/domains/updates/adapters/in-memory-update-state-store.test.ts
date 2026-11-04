// SPDX-License-Identifier: GPL-3.0-or-later
import { describeUpdateStateStoreContract } from '#domain-testing/updates';
import { InMemoryUpdateStateStore } from './in-memory-update-state-store.ts';

describeUpdateStateStoreContract('InMemoryUpdateStateStore', () =>
  Promise.resolve(new InMemoryUpdateStateStore()),
);
