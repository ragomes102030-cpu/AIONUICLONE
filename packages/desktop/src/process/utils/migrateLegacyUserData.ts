/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

// One-shot migrations of the legacy AionUi on-disk layout to the Arquimedes
// location.
//
// Two renames happened during the rebrand:
//
// 1. The product name changed from "AionUi" to "Arquimedes". Electron derives
//    the default userData directory from the application name (the top-level
//    `productName` in package.json), so on an existing installation the data
//    now lives under `%APPDATA%\AionUi` while the renamed app looks in
//    `%APPDATA%\Arquimedes`. Without this migration every chat, setting, the
//    aioncore database and the seeded skills would appear to be lost after the
//    upgrade.
//
// 2. The app-owned data directory inside userData was renamed from `aionui`
//    to `arquimedes`, so `%APPDATA%\Arquimedes\aionui` becomes
//    `%APPDATA%\Arquimedes\arquimedes` (see `getDataPath()`).
//
// Both steps run once, never overwrite files that the new location already
// has, and are best-effort: a failure must never block startup.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR_NAME, LEGACY_DATA_DIR_NAME } from './utils';

/** Legacy app-data directory name (pre-rebrand product name). */
const LEGACY_APP_DIR = 'AionUi';

/** Marker written into the new directory once the migration has run. */
const MIGRATION_MARKER = '.migrated-from-aionui';

/**
 * Rename `<userData>/aionui` to `<userData>/arquimedes`.
 *
 * `getDataPath()` falls back to the legacy directory when the new one does not
 * exist yet, so a failed rename (for example because a previous instance still
 * holds a database lock) keeps the app on its existing data instead of losing
 * it. A copy fallback is only used when the rename itself is refused.
 */
function renameLegacyDataDir(userDataDir: string): void {
  const currentDir = path.join(userDataDir, DATA_DIR_NAME);
  const legacyDir = path.join(userDataDir, LEGACY_DATA_DIR_NAME);

  if (path.resolve(currentDir) === path.resolve(legacyDir)) return;
  if (fs.existsSync(currentDir)) return;
  if (!fs.existsSync(legacyDir)) return;

  try {
    fs.renameSync(legacyDir, currentDir);
    console.log(`[Arquimedes] Renamed data directory: ${legacyDir} -> ${currentDir}`);
  } catch (error) {
    try {
      fs.cpSync(legacyDir, currentDir, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      console.log(`[Arquimedes] Copied legacy data directory: ${legacyDir} -> ${currentDir}`);
    } catch (copyError) {
      console.error('[Arquimedes] Failed to migrate the legacy data directory:', copyError);
    }
  }
}

/**
 * Copy `%APPDATA%\AionUi` into `%APPDATA%\Arquimedes` the first time the
 * renamed application starts. Safe to call on every boot: it is a no-op when
 * there is nothing to migrate or when the migration already ran.
 */
export function migrateLegacyUserData(): void {
  if (process.env.AIONUI_E2E_USER_DATA_DIR) return;

  try {
    const appDataDir = app.getPath('appData');
    const legacyDir = path.join(appDataDir, LEGACY_APP_DIR);
    const currentDir = path.join(appDataDir, path.basename(app.getPath('userData')));

    // 1) Rename the app-owned data directory inside userData. Runs in dev too,
    //    because the rename only touches directories the app itself owns.
    renameLegacyDataDir(currentDir);

    // 2) Only the packaged application uses the product-name-derived userData
    //    directory; development and E2E runs use isolated directories.
    if (!app.isPackaged) return;
    if (fs.existsSync(path.join(currentDir, MIGRATION_MARKER))) return;
    if (!fs.existsSync(legacyDir)) return;

    fs.mkdirSync(currentDir, { recursive: true });
    // `force: false` keeps any file the new location already created (e.g. a
    // fresh log directory) and never clobbers data written by the new app.
    fs.cpSync(legacyDir, currentDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    fs.writeFileSync(path.join(currentDir, MIGRATION_MARKER), new Date().toISOString());

    console.log(`[Arquimedes] Migrated legacy user data: ${legacyDir} -> ${currentDir}`);
  } catch (error) {
    // Migration is best-effort; a failure must never block startup.
    console.error('[Arquimedes] Failed to migrate legacy user data:', error);
  }
}
