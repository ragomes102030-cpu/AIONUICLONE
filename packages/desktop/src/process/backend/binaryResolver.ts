/**
 * Resolve the backend binary path (arquimedes-core; the legacy aioncore name
 * and bundled-aioncore/ directory are still accepted as fallbacks).
 *
 * Search order:
 *  1. AIONUI_BACKEND_BIN env override (path, resolved to absolute)
 *  2. Bundled with app (production: process.resourcesPath)
 *  3. Dev checkout: walk up from this file / cwd to resources/bundled-arquimedes-core
 *     (plus AIONUI_BACKEND_BUNDLED_DIR override, same as scripts/webui.ts)
 *  4. System PATH
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const BINARY_NAME = 'arquimedes-core';
const LEGACY_BINARY_NAME = 'aioncore';
const BUNDLED_DIR_NAME = 'bundled-arquimedes-core';
const LEGACY_BUNDLED_DIR_NAME = 'bundled-aioncore';
const BIN_ENV_VAR = 'AIONUI_BACKEND_BIN';
const MAX_DIR_ENTRIES = 20;
const MAX_LOOKUP_TEXT_LENGTH = 1000;

type BackendBinaryResolveDiagnostics = {
  envOverridePath?: string;
  envOverrideExists?: boolean;
  resourcesPath?: string;
  runtimeKey: string;
  binaryName: string;
  checkedBundledPath?: string;
  bundledDirExists?: boolean;
  runtimeDirExists?: boolean;
  resourcesDirEntries?: string[];
  runtimeDirEntries?: string[];
  pathLookupCommand: string;
  pathLookupResult?: string;
  pathLookupError?: string;
};

class BackendBinaryResolveError extends Error {
  readonly diagnostics: BackendBinaryResolveDiagnostics;

  constructor(message: string, diagnostics: BackendBinaryResolveDiagnostics) {
    super(message);
    this.name = 'BackendBinaryResolveError';
    this.diagnostics = diagnostics;
  }
}

function withPlatformExtension(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function getBinaryName(): string {
  return withPlatformExtension(BINARY_NAME);
}

function getLegacyBinaryName(): string {
  return withPlatformExtension(LEGACY_BINARY_NAME);
}

/**
 * First existing bundled binary for this platform, preferring the rebranded
 * layout over the legacy one:
 *   bundled-arquimedes-core/{runtimeKey}/arquimedes-core[.exe]
 *   bundled-arquimedes-core/{runtimeKey}/aioncore[.exe]
 *   bundled-aioncore/{runtimeKey}/arquimedes-core[.exe]
 *   bundled-aioncore/{runtimeKey}/aioncore[.exe]
 */
function findBundledBinary(resourcesRoot: string, runtimeKey: string, preferredBinaryName: string): string | null {
  const binaryNames = Array.from(new Set([preferredBinaryName, getBinaryName(), getLegacyBinaryName()]));
  const dirNames = Array.from(new Set([BUNDLED_DIR_NAME, LEGACY_BUNDLED_DIR_NAME]));
  for (const dirName of dirNames) {
    for (const binaryName of binaryNames) {
      const candidate = join(resourcesRoot, dirName, runtimeKey, binaryName);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function getRuntimeKey(): string {
  return `${process.platform}-${process.arch}`;
}

function listDirEntries(dirPath: string): string[] | undefined {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .slice(0, MAX_DIR_ENTRIES)
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`);
  } catch {
    return undefined;
  }
}

function trimLookupText(text: string): string {
  return text.trim().slice(0, MAX_LOOKUP_TEXT_LENGTH);
}

/**
 * Resolve the aioncore binary path.
 * Returns the absolute path to the binary, or throws if not found.
 */
export function resolveBinaryPath(): string {
  const runtimeKey = getRuntimeKey();
  const binaryName = getBinaryName();
  const diagnostics: BackendBinaryResolveDiagnostics = {
    runtimeKey,
    binaryName,
    pathLookupCommand: process.platform === 'win32' ? `where ${BINARY_NAME}` : `which ${BINARY_NAME}`,
  };

  const override = envOverridePath(diagnostics);
  if (override) return override;

  const bundled = bundledPath(runtimeKey, binaryName, diagnostics);
  if (bundled) return bundled;

  const fromPath = resolveFromSystemPATH(diagnostics);
  if (fromPath) return fromPath;

  throw new BackendBinaryResolveError(
    `Cannot find "${BINARY_NAME}" binary. Checked bundled location and system PATH.`,
    diagnostics
  );
}

/**
 * Honor the AIONUI_BACKEND_BIN env override.
 * The value is resolved to an absolute path (relative to process.cwd) so it
 * survives the backend launcher spawning with a different working directory.
 * Returns the path when it points at an existing file. When the variable is
 * set but the file is missing, throws so a typo fails loudly instead of
 * silently falling back to the bundled or PATH binary.
 */
function envOverridePath(diagnostics: BackendBinaryResolveDiagnostics): string | null {
  const raw = process.env[BIN_ENV_VAR]?.trim();
  if (!raw) return null;

  const absolute = resolve(raw);
  diagnostics.envOverridePath = absolute;
  const exists = existsSync(absolute);
  diagnostics.envOverrideExists = exists;
  if (exists) return absolute;

  throw new BackendBinaryResolveError(
    `${BIN_ENV_VAR} is set to "${raw}" but no file exists at "${absolute}".`,
    diagnostics
  );
}

/**
 * Check bundled binary in resources directory.
 * Layout: bundled-arquimedes-core/{platform}-{arch}/arquimedes-core[.exe]
 * (the pre-rebrand bundled-aioncore/ + aioncore[.exe] layout is accepted too)
 */
function bundledPath(
  runtimeKey: string,
  binaryName: string,
  diagnostics: BackendBinaryResolveDiagnostics
): string | null {
  const resourcesPaths = candidateResourcesPaths(runtimeKey, binaryName);
  if (resourcesPaths.length === 0) return null;
  diagnostics.resourcesPath = resourcesPaths[0];

  for (const resourcesPath of resourcesPaths) {
    const found = findBundledBinary(resourcesPath, runtimeKey, binaryName);
    if (found) return found;
    // Keep diagnostics for the first (packaged-style) candidate so the
    // failure report still points at the location the packaged app uses.
    if (diagnostics.checkedBundledPath === undefined) {
      const bundledDir = join(resourcesPath, BUNDLED_DIR_NAME);
      const runtimeDir = join(bundledDir, runtimeKey);
      diagnostics.checkedBundledPath = join(runtimeDir, binaryName);
      diagnostics.bundledDirExists = existsSync(bundledDir);
      diagnostics.runtimeDirExists = existsSync(runtimeDir);
      diagnostics.resourcesDirEntries = listDirEntries(resourcesPath);
      diagnostics.runtimeDirEntries = listDirEntries(runtimeDir);
    }
  }
  return null;
}

/**
 * Candidate roots that can hold
 * `bundled-arquimedes-core/{platform}-{arch}/arquimedes-core` (the legacy
 * `bundled-aioncore/.../aioncore` layout is also accepted).
 *
 * 1. Packaged app resources dir (process.resourcesPath — undefined in dev).
 * 2. `AIONUI_BACKEND_BUNDLED_DIR` override (same env var honored by
 *    scripts/webui.ts `resolveBackendBinary()`), so dev and scripts agree.
 * 3. Repo checkout `resources/` — found by walking up from this file and from
 *    `process.cwd()` (dev layouts vary: `packages/desktop/out/main`,
 *    repo root, etc.), so no hardcoded `..` depth that breaks per layout.
 */
function candidateResourcesPaths(runtimeKey: string, binaryName: string): string[] {
  const roots: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) roots.push(resourcesPath);

  const envDir = process.env.AIONUI_BACKEND_BUNDLED_DIR?.trim();
  if (envDir) {
    const isBundledDir = envDir.endsWith(BUNDLED_DIR_NAME) || envDir.endsWith(LEGACY_BUNDLED_DIR_NAME);
    roots.push(isBundledDir ? dirname(envDir) : envDir);
  }

  const startDirs: string[] = [];
  try {
    const here: string = typeof __dirname !== 'undefined' ? __dirname : '';
    if (here) startDirs.push(here);
  } catch {
    // ignore — fall through to cwd candidate
  }
  startDirs.push(process.cwd());

  for (const start of startDirs) {
    const found = walkUpToBundledResources(start, runtimeKey, binaryName);
    if (found) roots.push(found);
  }

  const seen = new Set<string>();
  return roots.filter((root) => {
    if (seen.has(root)) return false;
    seen.add(root);
    return true;
  });
}

/**
 * Walk up from `start` (max 10 levels) looking for a `resources/` dir that
 * actually contains the bundled binary for this platform. Returning only a
 * dir that holds the binary keeps dev checkouts working without ever
 * shadowing the packaged path or PATH lookup with a wrong guess.
 */
function walkUpToBundledResources(start: string, runtimeKey: string, binaryName: string): string | null {
  let dir = resolve(start);
  for (let level = 0; level < 10; level++) {
    const resourcesDir = join(dir, 'resources');
    if (findBundledBinary(resourcesDir, runtimeKey, binaryName)) return resourcesDir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Try to find the binary on the system PATH.
 */
function resolveFromSystemPATH(diagnostics: BackendBinaryResolveDiagnostics): string | null {
  try {
    const result = execSync(diagnostics.pathLookupCommand, { encoding: 'utf-8', timeout: 5000 }).trim();
    diagnostics.pathLookupResult = trimLookupText(result);
    const firstMatch = result.split(/\r?\n/).find((line) => line.trim());
    if (firstMatch && existsSync(firstMatch.trim())) return firstMatch.trim();
  } catch (error) {
    diagnostics.pathLookupError = error instanceof Error ? trimLookupText(error.message) : String(error);
    return null;
  }
  return null;
}

export type { BackendBinaryResolveDiagnostics };
