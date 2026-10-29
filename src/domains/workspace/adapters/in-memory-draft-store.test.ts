// SPDX-License-Identifier: GPL-3.0-or-later
import { describeDraftStoreContract } from '../testing/draft-store-contract.ts';
import { InMemoryDraftStore } from './in-memory-draft-store.ts';

describeDraftStoreContract('InMemoryDraftStore', () => Promise.resolve(new InMemoryDraftStore()));
