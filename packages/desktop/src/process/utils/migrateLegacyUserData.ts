/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

// One-shot migration of the legacy AionUi userData directory to the new
// Arquimedes location.
//
// The product was renamed from "AionUi" to "Arquimedes". Electron derives the
// default userData directory from the application name (the top-level
// `productName` in package.json), so on an existing installation the data now
// lives under `%APPDATA%\AionUi` while the renamed app looks in
// `%APPDATA%\Arquimedes`. Without this migration every chat, setting, the
// aioncore database and the seeded skills would appear to be lost after the
// upgrade.
//
// The copy runs once (guarded by a marker file), only in packaged builds, and
// never overwrites files that the new location already has.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Legacy app-data directory name (pre-rebrand product name). */
const LEGACY_APP_DIR = 'AionUi';

/** Marker written into the new directory once the migration has run. */
const MIGRATION_MARKER = '.migrated-from-aionui';

/**
 * Copy `%APPDATA%\AionUi` into `%APPDATA%\Arquimedes` the first time the
 * renamed application starts. Safe to call on every boot: it is a no-op when
 * there is nothing to migrate or when the migration already ran.
 */
export function migrateLegacyUserData(): void {
  // Only the packaged application uses the product-name-derived userData
  // directory; development and E2E runs use isolated directories.
  if (!app.isPackaged) return;
  if (process.env.AIONUI_E2E_USER_DATA_DIR) return;

  try {
    const appDataDir = app.getPath('appData');
    const legacyDir = path.join(appDataDir, LEGACY_APP_DIR);
    const currentDir = path.join(appDataDir, path.basename(app.getPath('userData')));

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
