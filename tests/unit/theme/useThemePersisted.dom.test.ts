/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { configGetMock } = vi.hoisted(() => ({ configGetMock: vi.fn() }));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      changed: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

vi.mock('@/renderer/utils/theme/applyTheme', () => ({
  applyTheme: vi.fn(),
  seedElectronTheme: vi.fn().mockResolvedValue(undefined),
  setActiveTheme: vi.fn(),
}));

vi.mock('@/renderer/utils/theme/systemThemeWatcher', () => ({
  startSystemThemeWatcher: vi.fn(() => vi.fn()),
}));

/**
 * Regression guard: after v2.4.0 broke the renderer, `getPersistedActiveId`
 * was changed to always return Light, which silently discarded the theme the
 * user picked (and reset it on every launch). The app must resolve the theme
 * stored in `theme.activeId`; Light is only the fallback for a fresh profile.
 *
 * The hook resolves its initial theme at module load, so this file imports it
 * dynamically after wiring the mock (each test file gets a fresh module graph).
 */
describe('useTheme persisted appearance', () => {
  it('restores the theme saved by the user instead of forcing Light', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'theme.activeId') return 'dark';
      if (key === 'theme.userThemes') return [];
      return undefined;
    });

    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current[0]?.appearance).toBe('dark'));
    expect(result.current[2]).toBe('dark');
  });
});
