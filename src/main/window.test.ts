// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createWindowOptions,
  hardenContents,
  hardenSession,
  isAppUrl,
  type HardenableContents,
  type HardenableSession,
} from './window.ts';

describe('createWindowOptions', () => {
  it('runs the renderer sandboxed and isolated, without Node (AGENTS.md, Electron boundary)', () => {
    const preferences = createWindowOptions('/app/preload.cjs').webPreferences;
    expect(preferences).toMatchObject({
      preload: '/app/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    });
  });

  it('shows "Paper Lion" as the title', () => {
    expect(createWindowOptions('/p').title).toBe('Paper Lion');
  });
});

describe('isAppUrl', () => {
  const file = 'file:///opt/paperl10n/out/renderer/index.html';
  const dev = 'http://localhost:5173/';
  it.each<[string | undefined, string, boolean]>([
    [file, file, true],
    [`${file}#/project`, file, true],
    [`${file}?x=1`, file, true],
    ['file:///etc/passwd', file, false],
    ['file:///opt/paperl10n/out/renderer/other.html', file, false],
    ['http://localhost:5173/', dev, true],
    ['http://localhost:5173/some/route', dev, true],
    ['http://localhost:5174/', dev, false],
    ['https://example.com/', dev, false],
    ['https://example.com/', file, false],
    ['not a url', file, false],
    ['', file, false],
    [undefined, file, false],
  ])('%s for %s → %s', (url, trusted, expected) => {
    expect(isAppUrl(url, trusted)).toBe(expected);
  });
});

function fakeContents() {
  let navigate: ((event: { preventDefault(): void; url: string }) => void) | undefined;
  let openHandler: ((details: { url: string }) => { action: 'deny' }) | undefined;
  const contents: HardenableContents = {
    on: (_event, listener) => {
      navigate = listener;
    },
    setWindowOpenHandler: (handler) => {
      openHandler = handler;
    },
  };
  const tryNavigate = (url: string) => {
    let prevented = false;
    navigate?.({ url, preventDefault: () => (prevented = true) });
    return prevented;
  };
  return { contents, tryNavigate, open: (url: string) => openHandler?.({ url }) };
}

describe('hardenContents', () => {
  const appUrl = 'file:///app/index.html';

  it('blocks navigation away from the app page, but not reloads of it', () => {
    const { contents, tryNavigate } = fakeContents();
    hardenContents(contents, appUrl);
    expect(tryNavigate('https://evil.example/')).toBe(true);
    expect(tryNavigate('file:///etc/passwd')).toBe(true);
    expect(tryNavigate('file:///app/index.html')).toBe(false);
  });

  it('denies every new window', () => {
    const { contents, open } = fakeContents();
    hardenContents(contents, appUrl);
    expect(open('https://example.com/')).toEqual({ action: 'deny' });
    expect(open(appUrl)).toEqual({ action: 'deny' });
  });
});

describe('hardenSession', () => {
  it('denies every permission request and check', () => {
    let request:
      | ((contents: unknown, permission: string, callback: (granted: boolean) => void) => void)
      | undefined;
    let check: (() => boolean) | undefined;
    const session: HardenableSession = {
      setPermissionRequestHandler: (handler) => {
        request = handler;
      },
      setPermissionCheckHandler: (handler) => {
        check = handler;
      },
    };
    hardenSession(session);
    const answers: boolean[] = [];
    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read']) {
      request?.({}, permission, (granted) => answers.push(granted));
    }
    expect(answers).toEqual([false, false, false, false]);
    expect(check?.()).toBe(false);
  });
});
