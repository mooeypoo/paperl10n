// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogMessageDto, MessageStatusDto } from '#ipc-contract';

/** Which messages to show: every one, those needing work (missing or outdated), or one status. */
export type StatusFilter = 'all' | 'needs-work' | MessageStatusDto;

const NEEDS_WORK: ReadonlySet<MessageStatusDto> = new Set(['missing', 'outdated']);

function hasStatus(message: CatalogMessageDto, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-work') return NEEDS_WORK.has(message.status);
  return message.status === filter;
}

/**
 * The messages with the status asked for whose key, source, or translation contains every word
 * of the query (ignoring case), in source order.
 */
export function filterMessages(
  messages: readonly CatalogMessageDto[],
  query: string,
  status: StatusFilter,
): CatalogMessageDto[] {
  const words = query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  return messages.filter((message) => {
    if (!hasStatus(message, status)) return false;
    const haystack =
      `${message.key}\n${message.source}\n${message.translation ?? ''}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
