// SPDX-License-Identifier: GPL-3.0-or-later
// The real fetch against a local HTTP server: no network.
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { describeUpdateSourceContract, FakeUpdateSource } from '#domain-testing/updates';
import { githubUpdateSource, LATEST_RELEASE_URL } from './github-update-source.ts';

type Handler = (
  path: string,
  headers: IncomingHttpHeaders,
) => {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Never answer. */
  hang?: boolean;
  /** Sent in pieces, without a declared length. */
  chunks?: string[];
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

/** A local server; its base URL (127.0.0.1). */
async function serve(handler: Handler): Promise<string> {
  const server = createServer((request, response) => {
    const answer = handler(request.url ?? '/', request.headers);
    if (answer.hang === true) return;
    response.writeHead(answer.status ?? 200, answer.headers ?? {});
    for (const chunk of answer.chunks ?? []) response.write(chunk);
    response.end(answer.body ?? '');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const local = (base: string, options: { timeoutMs?: number; maxBytes?: number } = {}) =>
  githubUpdateSource({
    url: `${base}/latest.json`,
    hosts: ['127.0.0.1'],
    allowHttp: true,
    ...options,
  });
const release = FakeUpdateSource.releaseBody('0.2.0');
const unreachable = { ok: false, error: 'unreachable' };

describeUpdateSourceContract('githubUpdateSource', async (body) => {
  if (body === null)
    return githubUpdateSource({
      url: 'http://127.0.0.1:9/latest.json',
      hosts: ['127.0.0.1'],
      allowHttp: true,
      timeoutMs: 2000,
    });
  return local(await serve(() => ({ body })));
});

describe('githubUpdateSource', () => {
  it("asks GitHub's stable address for the newest published release", () => {
    expect(LATEST_RELEASE_URL).toBe(
      'https://github.com/mooeypoo/paperl10n/releases/latest/download/latest.json',
    );
  });

  it('sends nothing about the user: no cookies, no version, no identifier', async () => {
    let seen: { path: string; headers: IncomingHttpHeaders } | undefined;
    const base = await serve((path, headers) => {
      seen = { path, headers };
      return { body: release };
    });
    expect((await local(base).latest()).ok).toBe(true);
    expect(seen?.path).toBe('/latest.json');
    expect(seen?.headers.cookie).toBeUndefined();
    expect(seen?.headers.authorization).toBeUndefined();
    expect(
      Object.keys(seen?.headers ?? {}).filter((name) => /paperl10n|version/i.test(name)),
    ).toEqual([]);
  });

  it('follows redirects on the allowed hosts', async () => {
    const base = await serve((path) =>
      path === '/latest.json'
        ? { status: 302, headers: { location: '/download/v0.2.0/latest.json' } }
        : { body: release },
    );
    expect((await local(base).latest()).ok).toBe(true);
  });

  it('refuses a redirect to another host', async () => {
    const other = await serve(() => ({ body: release }));
    const base = await serve(() => ({
      status: 302,
      headers: { location: other.replace('127.0.0.1', 'localhost') + '/latest.json' },
    }));
    expect(await local(base).latest()).toEqual(unreachable);
  });

  it('gives up after too many redirects', async () => {
    const base = await serve(() => ({ status: 302, headers: { location: '/latest.json' } }));
    expect(await local(base).latest()).toEqual(unreachable);
  });

  it('refuses plain http unless told otherwise, and hosts it was not given', async () => {
    const base = await serve(() => ({ body: release }));
    expect(
      await githubUpdateSource({ url: `${base}/latest.json`, hosts: ['127.0.0.1'] }).latest(),
    ).toEqual(unreachable);
    expect(
      await githubUpdateSource({
        url: `${base}/latest.json`,
        hosts: ['github.com'],
        allowHttp: true,
      }).latest(),
    ).toEqual(unreachable);
  });

  it.each<[string, Parameters<Handler>[0] extends string ? ReturnType<Handler> : never]>([
    ['an error status', { status: 404, body: release }],
    ['a body too big', { body: `${release}${' '.repeat(70_000)}` }],
    ['a declared length too big', { headers: { 'content-length': '999999' }, body: release }],
    ['an empty body', { body: '' }],
  ])('is unreachable for %s', async (_description, answer) => {
    const base = await serve(() => answer);
    expect(await local(base).latest()).toEqual(unreachable);
  });

  it('reads a body sent in pieces, and stops reading one that grows too big', async () => {
    const pieces = await serve(() => ({ chunks: [release.slice(0, 20), release.slice(20)] }));
    expect((await local(pieces).latest()).ok).toBe(true);
    const endless = await serve(() => ({
      chunks: Array<string>(20).fill(' '.repeat(1000)),
      body: release,
    }));
    expect(await local(endless, { maxBytes: 5000 }).latest()).toEqual(unreachable);
  });

  it('gives up on a server that never answers', async () => {
    const base = await serve(() => ({ hang: true }));
    expect(await local(base, { timeoutMs: 200 }).latest()).toEqual(unreachable);
  });
});
