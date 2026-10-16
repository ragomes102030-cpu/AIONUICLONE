/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBinaryPath } from '@/process/backend/binaryResolver';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const originalBackendBin = process.env.AIONUI_BACKEND_BIN;
const originalBundledDirEnv = process.env.AIONUI_BACKEND_BUNDLED_DIR;

function setResourcesPath(resourcesPath: string | undefined): void {
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: resourcesPath,
  });
}

function restoreBackendBin(): void {
  if (originalBackendBin === undefined) {
    delete process.env.AIONUI_BACKEND_BIN;
  } else {
    process.env.AIONUI_BACKEND_BIN = originalBackendBin;
  }
  if (originalBundledDirEnv === undefined) {
    delete process.env.AIONUI_BACKEND_BUNDLED_DIR;
  } else {
    process.env.AIONUI_BACKEND_BUNDLED_DIR = originalBundledDirEnv;
  }
}

function dirEntry(name: string, isDirectory = false): ReturnType<typeof readdirSync>[number] {
  return {
    name,
    isDirectory: () => isDirectory,
  } as unknown as ReturnType<typeof readdirSync>[number];
}

describe('resolveBinaryPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AIONUI_BACKEND_BIN;
    delete process.env.AIONUI_BACKEND_BUNDLED_DIR;
  });

  afterEach(() => {
    setResourcesPath(originalResourcesPath);
    restoreBackendBin();
  });

  it('returns the AIONUI_BACKEND_BIN override when the file exists', () => {
    const overrideInput = '/custom/aioncore';
    // Resolve mirrors the implementation so the expectation holds on Windows too.
    const overridePath = resolve(overrideInput);
    process.env.AIONUI_BACKEND_BIN = overrideInput;
    vi.mocked(existsSync).mockImplementation((path) => path === overridePath);

    expect(resolveBinaryPath()).toBe(overridePath);
    // Override wins before bundled/PATH lookup runs.
    expect(execSync).not.toHaveBeenCalled();
  });

  it('trims whitespace around AIONUI_BACKEND_BIN before use', () => {
    const overrideInput = '/custom/aioncore';
    const overridePath = resolve(overrideInput);
    process.env.AIONUI_BACKEND_BIN = `  ${overrideInput}  `;
    vi.mocked(existsSync).mockImplementation((path) => path === overridePath);

    expect(resolveBinaryPath()).toBe(overridePath);
  });

  it('resolves a relative AIONUI_BACKEND_BIN against process.cwd', () => {
    process.env.AIONUI_BACKEND_BIN = 'rel/aioncore';
    const absolute = resolve('rel/aioncore');
    vi.mocked(existsSync).mockImplementation((path) => path === absolute);

    expect(resolveBinaryPath()).toBe(absolute);
  });

  it('throws with override diagnostics when AIONUI_BACKEND_BIN points at a missing file', () => {
    const overrideInput = '/custom/missing-aioncore';
    const overridePath = resolve(overrideInput);
    process.env.AIONUI_BACKEND_BIN = overrideInput;
    vi.mocked(existsSync).mockReturnValue(false);

    // Error message quotes the raw input, diagnostics carry the resolved path.
    expect(() => resolveBinaryPath()).toThrow(`AIONUI_BACKEND_BIN is set to "${overrideInput}"`);

    try {
      resolveBinaryPath();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'BackendBinaryResolveError',
        diagnostics: expect.objectContaining({
          envOverridePath: overridePath,
          envOverrideExists: false,
        }),
      });
    }
    // A missing explicit override fails loudly instead of falling back.
    expect(execSync).not.toHaveBeenCalled();
  });

  it('ignores a blank AIONUI_BACKEND_BIN and falls back to the normal search order', () => {
    process.env.AIONUI_BACKEND_BIN = '   ';
    const resolved = '/usr/local/bin/aioncore';

    setResourcesPath(undefined);
    vi.mocked(execSync).mockReturnValue(`${resolved}\n`);
    // walkUpToBundledResources must not match: only the exact dev candidate
    // returns true, everything else returns false.
    vi.mocked(existsSync).mockImplementation((path) => path === resolved);

    expect(resolveBinaryPath()).toBe(resolved);
  });

  it('falls back to the repo checkout bundled binary when resourcesPath is unset (dev)', () => {
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';
    const repoRoot = resolve(process.cwd());
    const devCandidate = join(repoRoot, 'resources', 'bundled-aioncore', runtimeKey, binaryName);

    setResourcesPath(undefined);
    vi.mocked(existsSync).mockImplementation((path) => String(path) === devCandidate);
    vi.mocked(readdirSync).mockReturnValue([]);

    expect(resolveBinaryPath()).toBe(devCandidate);
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it('honors AIONUI_BACKEND_BUNDLED_DIR when resourcesPath is unset (dev)', () => {
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';
    const customBase = resolve('/custom', 'artifacts', 'bundled-aioncore');
    const customCandidate = join(dirname(customBase), 'bundled-aioncore', runtimeKey, binaryName);

    setResourcesPath(undefined);
    process.env.AIONUI_BACKEND_BUNDLED_DIR = customBase;
    vi.mocked(existsSync).mockImplementation((path) => String(path) === customCandidate);
    vi.mocked(readdirSync).mockReturnValue([]);

    expect(resolveBinaryPath()).toBe(customCandidate);
  });

  it('attaches bundled path diagnostics when the backend binary cannot be resolved', () => {
    const resourcesPath = '/app/resources';
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'arquimedes-core.exe' : 'arquimedes-core';
    const bundledDir = join(resourcesPath, 'bundled-arquimedes-core');
    const runtimeDir = join(bundledDir, runtimeKey);
    const checkedBundledPath = join(runtimeDir, binaryName);

    setResourcesPath(resourcesPath);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockImplementation((path) => {
      if (path === resourcesPath) return [dirEntry('bundled-arquimedes-core', true)];
      if (path === runtimeDir) return [dirEntry('manifest.json')];
      return [] as ReturnType<typeof readdirSync>;
    });
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found on PATH');
    });

    expect(() => resolveBinaryPath()).toThrow('Cannot find "arquimedes-core" binary');

    try {
      resolveBinaryPath();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'BackendBinaryResolveError',
        diagnostics: expect.objectContaining({
          resourcesPath,
          runtimeKey,
          binaryName,
          checkedBundledPath,
          bundledDirExists: false,
          runtimeDirExists: false,
          resourcesDirEntries: ['bundled-arquimedes-core/'],
          runtimeDirEntries: ['manifest.json'],
          pathLookupCommand: process.platform === 'win32' ? 'where arquimedes-core' : 'which arquimedes-core',
          pathLookupError: expect.stringContaining('not found on PATH'),
        }),
      });
    }
  });
});
