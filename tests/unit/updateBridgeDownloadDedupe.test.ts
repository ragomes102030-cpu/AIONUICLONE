/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

const FORK_CDN_BASE = 'https://raw.githubusercontent.com/ragomes102030-cpu/AIONUICLONE/main/releases';
const FORK_GITHUB_BASE = 'https://github.com/ragomes102030-cpu/AIONUICLONE/releases/download';

const makeRequest = (version = '2.2.0', name = 'AionUi-2.2.0-mac-arm64.dmg') => ({
  url: `${FORK_CDN_BASE}/${version}/${name}`,
  fallbackUrl: `${FORK_GITHUB_BASE}/v${version}/${name}`,
  file_name: name,
});

let _originalFetch = undefined;

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/tmp/aionui-update-dedupe-test'),
    exit: vi.fn(),
    isPackaged: true,
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const getDownloadHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const provider = vi.mocked(ipcBridge.update.download.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.download handler not registered');
  return lastCall[0];
};

const getDownloadHandlers = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const downloadProvider = vi.mocked(ipcBridge.update.download.provider);
  const cancelProvider = vi.mocked(ipcBridge.update.cancelDownload.provider);
  const downloadCall = downloadProvider.mock.calls.at(-1);
  const cancelCall = cancelProvider.mock.calls.at(-1);
  if (!downloadCall) throw new Error('update.download handler not registered');
  if (!cancelCall) throw new Error('update.download.cancel handler not registered');
  return {
    download: downloadCall[0],
    cancel: cancelCall[0],
    ipcBridge,
  };
};

describe('updateBridge manual download dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof globalThis.fetch === 'function') {
      _originalFetch = globalThis.fetch;
    }
    (globalThis as any).fetch = vi.fn(() => new Promise<Response>(() => {}));
  });

  afterEach(() => {
    if (_originalFetch !== undefined) {
      (globalThis as any).fetch = _originalFetch;
      _originalFetch = undefined;
    } else {
      delete (globalThis as any).fetch;
    }
  });

  it('reuses the active manual download for the same URL, fallback URL, and file name', async () => {
    const handler = await getDownloadHandler();
    const request = makeRequest();

    const first = await handler({
      ...request,
      downloadId: 'first-download',
    });
    const second = await handler({
      ...request,
      downloadId: 'second-download',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.data).toEqual(first.data);
    expect(first.data?.downloadId).toBe('first-download');
  });

  it('creates a new manual download after the prior matching task reaches a terminal state', async () => {
    fs.mkdirSync('/tmp/aionui-update-dedupe-test', { recursive: true });
    if (typeof globalThis.fetch === 'function') {
      _originalFetch = globalThis.fetch;
    }
    // The fetch has to RESOLVE for the download to reach `completed`; a pending
    // promise here leaves the download in-flight forever and the poll below times out.
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '0' }),
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });

    const handler = await getDownloadHandler();
    const request = makeRequest();

    const first = await handler({
      ...request,
      downloadId: 'first-download',
    });

    const { ipcBridge } = await import('@/common');
    await expect
      .poll(() =>
        vi.mocked(ipcBridge.update.downloadProgress.emit).mock.calls.some(([evt]) => evt.status === 'completed')
      )
      .toBe(true);

    const second = await handler({
      ...request,
      downloadId: 'second-download',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data?.downloadId).toBe('first-download');
    expect(second.data?.downloadId).toBe('second-download');
  });

  it('cancels an active manual download by download id and clears its dedupe slot', async () => {
    fs.mkdirSync('/tmp/aionui-update-dedupe-test', { recursive: true });
    if (typeof globalThis.fetch === 'function') {
      _originalFetch = globalThis.fetch;
    }
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '0' }),
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });

    const { download, cancel, ipcBridge } = await getDownloadHandlers();
    const request = makeRequest();

    const first = await download({
      ...request,
      downloadId: 'first-download',
    });
    const cancelResult = await cancel({ downloadId: 'first-download' });

    expect(first.success).toBe(true);
    expect(cancelResult).toEqual({ success: true });
    await expect
      .poll(() =>
        vi
          .mocked(ipcBridge.update.downloadProgress.emit)
          .mock.calls.some(([evt]) => evt.downloadId === 'first-download' && evt.status === 'cancelled')
      )
      .toBe(true);

    const second = await download({
      ...request,
      downloadId: 'second-download',
    });

    expect(second.success).toBe(true);
    expect(second.data?.downloadId).toBe('second-download');
  });
});
