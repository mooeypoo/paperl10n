// SPDX-License-Identifier: GPL-3.0-or-later
import { err, ok } from '#kernel/result';
import type { UpdateSource } from '../application/ports/update-source.ts';
import { parseLatestRelease } from '../domain/release.ts';

/**
 * Where update notices come from. GitHub sends this address to the newest published release's
 * `latest.json`, so it never changes (a draft or a pre-release is never "latest").
 */
export const LATEST_RELEASE_URL =
  'https://github.com/mooeypoo/paperl10n/releases/latest/download/latest.json';

/** github.com redirects release files to its file hosts; nothing else is followed. */
export const GITHUB_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
/** latest.json is a few hundred bytes; anything this big isn't it. */
const MAX_BYTES = 64 * 1024;

export interface GitHubUpdateSourceOptions {
  readonly url: string;
  /** Hosts the request and every redirect may go to. */
  readonly hosts: readonly string[];
  /** Tests only: a local server without HTTPS. */
  readonly allowHttp?: boolean;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

/**
 * Fetches `latest.json` (the same as Plot Device's). The request carries nothing about the user or
 * the app: no identifier, no version, no cookies. Redirects are followed by hand, so each one is
 * checked against `hosts`. Anything unexpected is "unreachable", and the next check tries again.
 */
export function githubUpdateSource({
  url,
  hosts,
  allowHttp = false,
  timeoutMs = TIMEOUT_MS,
  maxBytes = MAX_BYTES,
}: GitHubUpdateSourceOptions): UpdateSource {
  const allowed = (address: URL): boolean =>
    (address.protocol === 'https:' || (allowHttp && address.protocol === 'http:')) &&
    hosts.includes(address.hostname);
  return {
    async latest() {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        let address = new URL(url);
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          if (!allowed(address)) return err('unreachable');
          const response = await fetch(address, {
            redirect: 'manual',
            credentials: 'omit',
            signal,
            headers: { accept: 'application/json' },
          });
          const location = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && location !== null) {
            await response.body?.cancel();
            address = new URL(location, address);
            continue;
          }
          if (!response.ok) return err('unreachable');
          const text = await readUpTo(response, maxBytes);
          const release = text === null ? null : parseLatestRelease(JSON.parse(text));
          return release === null ? err('unreachable') : ok(release);
        }
        return err('unreachable');
      } catch {
        return err('unreachable');
      }
    },
  };
}

/** The body as text, or `null` once it passes `maxBytes`, without reading the rest. */
async function readUpTo(response: Response, maxBytes: number): Promise<string | null> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (response.body === null) return '';
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
