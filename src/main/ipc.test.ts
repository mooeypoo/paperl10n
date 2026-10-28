// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { apiMethods, channelFor, type PaperLionApi } from '#ipc-contract';
import { ok } from '#kernel/result';
import {
  argumentValidators,
  registerApi,
  trustedSenderCheck,
  type IpcEvent,
  type IpcRegistrar,
} from './ipc.ts';

type Handler = (event: IpcEvent, ...args: unknown[]) => Promise<unknown>;

const appUrl = 'file:///app/index.html';
const trusted: IpcEvent = { senderFrame: { url: appUrl, parent: null } };
const invalidRequest = {
  ok: false,
  error: { code: 'internal.invalid-request', params: {}, details: [] },
};

function setup() {
  const handlers = new Map<string, Handler>();
  const calls: unknown[][] = [];
  const rejections: string[] = [];
  const registrar: IpcRegistrar = {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
  };
  const api: PaperLionApi = {
    openProject: () => {
      calls.push(['openProject']);
      return Promise.resolve(ok(null));
    },
    listSourceDocuments: (request) => {
      calls.push(['listSourceDocuments', request]);
      return Promise.resolve(ok([]));
    },
    readDocumentPair: (request) => {
      calls.push(['readDocumentPair', request]);
      return Promise.resolve(
        ok({
          key: request.key,
          source: { path: 'a', text: '', blocks: [], inline: [] },
          target: null,
        }),
      );
    },
  };
  registerApi(
    registrar,
    api,
    trustedSenderCheck((url) => url === appUrl),
    (method, reason) => rejections.push(`${method}: ${reason}`),
  );
  const send = (method: string, event: IpcEvent, ...args: unknown[]) => {
    const handler = handlers.get(channelFor(method as (typeof apiMethods)[number]));
    if (handler === undefined) throw new Error(`no handler for ${method}`);
    return handler(event, ...args);
  };
  return { handlers, calls, rejections, send };
}

describe('registerApi', () => {
  it('registers exactly one handler per contract method', () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(apiMethods.map(channelFor).sort());
  });

  it('forwards valid requests from the app page to the API', async () => {
    const { calls, send } = setup();
    expect(await send('openProject', trusted)).toEqual({ ok: true, value: null });
    expect(await send('listSourceDocuments', trusted, { projectId: 'p1' })).toEqual({
      ok: true,
      value: [],
    });
    expect(await send('readDocumentPair', trusted, { projectId: 'p1', key: 'k' })).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([
      ['openProject'],
      ['listSourceDocuments', { projectId: 'p1' }],
      ['readDocumentPair', { projectId: 'p1', key: 'k' }],
    ]);
  });

  it.each<[string, IpcEvent]>([
    ['another page', { senderFrame: { url: 'https://evil.example/', parent: null } }],
    ['a subframe of the app page', { senderFrame: { url: appUrl, parent: {} } }],
    ['a frame that is gone', { senderFrame: null }],
  ])('rejects requests from %s without calling the API', async (_description, event) => {
    const { calls, rejections, send } = setup();
    expect(await send('openProject', event)).toEqual(invalidRequest);
    expect(calls).toEqual([]);
    expect(rejections).toEqual(['openProject: untrusted-sender']);
  });

  it('rejects arguments that do not match the contract without calling the API', async () => {
    const { calls, rejections, send } = setup();
    expect(await send('listSourceDocuments', trusted, { projectId: 42 })).toEqual(invalidRequest);
    expect(await send('openProject', trusted, 'unexpected')).toEqual(invalidRequest);
    expect(calls).toEqual([]);
    expect(rejections).toEqual([
      'listSourceDocuments: invalid-arguments',
      'openProject: invalid-arguments',
    ]);
  });

  it('passes the API only the fields the contract defines', async () => {
    const { calls, send } = setup();
    await send('listSourceDocuments', trusted, { projectId: 'p1' });
    expect(calls[0]?.[1]).toEqual({ projectId: 'p1' });
  });
});

describe('argumentValidators', () => {
  it('has a validator for every contract method', () => {
    expect(Object.keys(argumentValidators).sort()).toEqual([...apiMethods].sort());
  });

  it.each<[string, unknown[], boolean]>([
    ['openProject()', [], true],
    ['openProject(x)', [1], false],
  ])('openProject: %s → %s', (_d, args, valid) => {
    expect(argumentValidators.openProject(args)).toBe(valid);
  });

  it.each<[string, unknown[], boolean]>([
    ['a project id', [{ projectId: 'abc' }], true],
    ['no arguments', [], false],
    ['null', [null], false],
    ['a string', ['abc'], false],
    ['an empty id', [{ projectId: '' }], false],
    ['a numeric id', [{ projectId: 1 }], false],
    ['an extra field', [{ projectId: 'abc', path: '/etc' }], false],
    ['an extra argument', [{ projectId: 'abc' }, 'more'], false],
    ['a very long id', [{ projectId: 'x'.repeat(201) }], false],
  ])('listSourceDocuments: %s → %s', (_d, args, valid) => {
    expect(argumentValidators.listSourceDocuments(args)).toBe(valid);
  });

  it.each<[string, unknown[], boolean]>([
    ['a project id and a key', [{ projectId: 'abc', key: 'guide/intro' }], true],
    ['no arguments', [], false],
    ['null', [null], false],
    ['no key', [{ projectId: 'abc' }], false],
    ['an empty key', [{ projectId: 'abc', key: '' }], false],
    ['a numeric key', [{ projectId: 'abc', key: 1 }], false],
    ['an empty project id', [{ projectId: '', key: 'k' }], false],
    ['an extra field', [{ projectId: 'abc', key: 'k', path: '/etc/passwd' }], false],
    ['an extra argument', [{ projectId: 'abc', key: 'k' }, 'more'], false],
    ['a very long key', [{ projectId: 'abc', key: 'x'.repeat(1001) }], false],
    ['an array', [['abc', 'k']], false],
  ])('readDocumentPair: %s → %s', (_d, args, valid) => {
    expect(argumentValidators.readDocumentPair(args)).toBe(valid);
  });
});
