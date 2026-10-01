/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import path from 'path';
import { getDataPath } from '@process/utils';
import { BACKEND_DATABASE_FILENAME } from './backendDatabase';

// Imported from its own module, NOT from `repairMcpServerTimestamps`: that module
// is mocked wholesale in the migration tests, and a constant reached through a
// mock arrives as `undefined`.
export { BACKEND_DATABASE_FILENAME };

/** Where snapshots live, next to the database they protect. */
export const BACKUP_DIR_NAME = 'backups';
/** How many snapshots to keep. Old ones are pruned oldest-first. */
export const BACKUP_KEEP = 10;
/**
 * Do not snapshot more often than this. Every backup rewrites ~the whole
 * database, and a healthy machine boots several times a day; the window still
 * covers upgrades, because those always follow a long gap without a snapshot.
 */
export const BACKUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type BackendBackupResult = {
  skipped: boolean;
  backupPath?: string;
  /** Set when skipped: 'no-database' | 'no-change' | 'error'. */
  reason?: string;
  prunedCount: number;
  /** Populated only when the copy failed and nothing was written. */
  error?: string;
};

export type BackendBackupOptions = {
  now?: number;
  keep?: number;
  /** Defaults to the app data directory. Tests pass a temp directory. */
  dataDir?: string;
};

const stampedName = (now: number): string => {
  const iso = new Date(now).toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `aionui-backend-${iso}.db`;
};

const newestBackupTime = (dir: string): number => {
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith('aionui-backend-') && name.endsWith('.db'))
      .reduce((latest, name) => Math.max(latest, statSync(path.join(dir, name)).mtimeMs), 0);
  } catch {
    return 0;
  }
};

const prune = (dir: string, keep: number): number => {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith('aionui-backend-') && name.endsWith('.db'))
    .map((name) => ({ name, mtime: statSync(path.join(dir, name)).mtimeMs }))
    .toSorted((a, b) => b.mtime - a.mtime);

  let pruned = 0;
  for (const file of files.slice(keep)) {
    try {
      rmSync(path.join(dir, file.name), { force: true });
      pruned += 1;
    } catch {
      // A locked or missing file must never fail the boot.
    }
  }
  return pruned;
};

/**
 * Snapshot the backend database before anything mutates it.
 *
 * The backend (aioncore) owns this file and runs its own schema migrations; the
 * main process only ever reads it. Taking the snapshot here — as the first
 * cleanup step, ahead of the repair and the migration steps — is what makes a
 * failed upgrade recoverable instead of fatal: the worst case becomes "restore
 * the snapshot and roll the app back".
 *
 * `VACUUM INTO` is used because it writes a consistent copy of a live database
 * in a single statement. A plain `copyFileSync` of a file another process is
 * writing can capture a torn page. If the database cannot be opened (locked,
 * corrupt, SQLite unavailable) it falls back to a file copy and reports the
 * failure rather than throwing — a backup that fails must never block startup.
 */
export function backupBackendDatabase(options?: BackendBackupOptions): BackendBackupResult {
  const now = options?.now ?? Date.now();
  const keep = options?.keep ?? BACKUP_KEEP;
  const dataDir = options?.dataDir ?? getDataPath();
  const dbPath = path.join(dataDir, BACKEND_DATABASE_FILENAME);
  const base: BackendBackupResult = { skipped: true, prunedCount: 0 };

  if (!existsSync(dbPath)) return { ...base, reason: 'no-database' };

  const backupDir = path.join(dataDir, BACKUP_DIR_NAME);
  const elapsed = now - newestBackupTime(backupDir);
  if (elapsed >= 0 && elapsed < BACKUP_MIN_INTERVAL_MS) {
    return { ...base, reason: 'no-change' };
  }

  try {
    mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, stampedName(now));

    let copied = false;
    try {
      // Lazy require: better-sqlite3 is an optional native dependency and the
      // whole point of this function is to survive when it is unavailable.
      const Database = require('better-sqlite3');
      const source = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        source.prepare('VACUUM INTO ?').run(target);
      } finally {
        source.close();
      }
      copied = true;
    } catch {
      // Fall through to the file copy below.
    }

    if (!copied) {
      copyFileSync(dbPath, target);
      // Best effort: carry the WAL along so recent transactions are not lost.
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = `${dbPath}${suffix}`;
        if (existsSync(sidecar)) copyFileSync(sidecar, `${target}${suffix}`);
      }
    }

    return { skipped: false, backupPath: target, prunedCount: prune(backupDir, keep) };
  } catch (error) {
    return { ...base, reason: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}
