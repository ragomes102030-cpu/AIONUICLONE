/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Phone / WebUI regression: the in-app browser used to render an Electron-only
// `<webview>` element unconditionally.
//
// `<webview>` only exists inside Electron (enabled via `webviewTag: true`), and
// WebviewHost's `isLoading` flag starts at `true` and is cleared solely by that
// element's `did-finish-load` / `did-stop-loading` events. In a plain browser
// those events never fire, so the flag stayed `true` forever and the panel
// showed a spinner that never stopped — no error, no fallback, just a spinner.
//
// The fix branches on isElectronDesktop(): Electron keeps the real webview,
// everything else renders an iframe plus an always-visible notice and an
// "open in new tab" escape hatch. These tests assert the browser path really
// renders the iframe/notice (and stops pointing at <webview>), that the iframe
// sandbox does not hand a same-origin embed the parent's origin, and that the
// desktop path is untouched.

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `t` echoes the key, so asserting on the key proves the string was rendered
// through i18n rather than disappearing into an empty node.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en-US' },
  }),
}));

import WebviewHost from '@/renderer/components/media/WebviewHost';

/**
 * `tests/vitest.dom.setup.ts` stubs `window.electronAPI`, which is exactly how
 * `isElectronDesktop()` decides it is running in the desktop app. Deleting the
 * stub is therefore how a WebUI / phone browser is simulated.
 */
const enterWebMode = (): (() => void) => {
  const w = window as Window & { electronAPI?: unknown };
  const saved = w.electronAPI;
  delete w.electronAPI;
  return () => {
    w.electronAPI = saved;
  };
};

const iframeOf = (container: HTMLElement): HTMLIFrameElement | null => container.querySelector('iframe');

describe('WebviewHost in a plain browser (WebUI / phone)', () => {
  afterEach(() => cleanup());

  it('renders an iframe instead of the Electron-only <webview> element', () => {
    const restore = enterWebMode();
    try {
      const { container } = render(<WebviewHost url='https://example.com/docs' showNavBar />);

      const iframe = iframeOf(container);
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute('src')).toBe('https://example.com/docs');
      expect(container.querySelector('webview')).toBeNull();
    } finally {
      restore();
    }
  });

  it('shows a notice and an open-in-new-tab escape hatch so the panel never spins silently', () => {
    const restore = enterWebMode();
    try {
      render(<WebviewHost url='https://example.com' />);

      expect(screen.getByText('preview.browser.desktopOnlyHint')).toBeInTheDocument();
      expect(screen.getByText('preview.browser.openInNewTab')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('reports the target URL and its host back to the caller so the tab label follows', () => {
    const restore = enterWebMode();
    const onUrlChange = vi.fn();
    const onTitleChange = vi.fn();
    try {
      render(
        <WebviewHost url='https://example.com/some/page' onUrlChange={onUrlChange} onTitleChange={onTitleChange} />
      );

      expect(onUrlChange).toHaveBeenCalledWith('https://example.com/some/page');
      expect(onTitleChange).toHaveBeenCalledWith('example.com');
    } finally {
      restore();
    }
  });

  it('navigates the iframe when a URL is submitted through the address bar', () => {
    const restore = enterWebMode();
    try {
      const { container } = render(<WebviewHost url='https://example.com/a' showNavBar />);

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();

      fireEvent.change(input, { target: { value: 'https://example.org/b' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);

      expect(iframeOf(container)?.getAttribute('src')).toBe('https://example.org/b');
    } finally {
      restore();
    }
  });

  it('opens the current target in a real browser tab (the phone browser)', () => {
    const restore = enterWebMode();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      render(<WebviewHost url='https://example.com/start' showNavBar />);

      fireEvent.click(screen.getByText('preview.browser.openInNewTab'));

      expect(openSpy).toHaveBeenCalledWith('https://example.com/start', '_blank', 'noopener,noreferrer');
    } finally {
      openSpy.mockRestore();
      restore();
    }
  });

  it('drops allow-same-origin for a same-origin target but keeps it for cross-origin pages', () => {
    const restore = enterWebMode();
    try {
      const sameOrigin = render(<WebviewHost url={`${window.location.origin}/index.html`} />);
      const sameSandbox = iframeOf(sameOrigin.container)?.getAttribute('sandbox') ?? '';
      // An embedded copy of the app must not be able to script the parent.
      expect(sameSandbox).not.toContain('allow-same-origin');
      sameOrigin.unmount();

      const crossOrigin = render(<WebviewHost url='https://example.com' />);
      const crossSandbox = iframeOf(crossOrigin.container)?.getAttribute('sandbox') ?? '';
      expect(crossSandbox).toContain('allow-same-origin');
    } finally {
      restore();
    }
  });
});

describe('WebviewHost in the desktop app', () => {
  afterEach(() => cleanup());

  it('does not take the browser fallback branch when Electron is present', () => {
    // window.electronAPI is stubbed by the dom setup, so this is desktop mode.
    const { container } = render(<WebviewHost url='https://example.com' />);

    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('preview.browser.desktopOnlyHint')).toBeNull();
  });
});
