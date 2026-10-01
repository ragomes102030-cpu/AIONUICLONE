import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BACKEND_DATABASE_FILENAME,
  BACKUP_DIR_NAME,
  BACKUP_KEEP,
  backupBackendDatabase,
} from '@process/services/database/backupBackendDatabase';

let dataDir = '';

const dbPathIn = (dir: string) => path.join(dir, BACKEND_DATABASE_FILENAME);

/** Creates a real SQLite file holding `count` rows so the copy can be verified. */
function seedDatabase(dir: string, count: number): void {
  const db = new Database(dbPathIn(dir));
  db.exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY, name TEXT)');
  const insert = db.prepare('INSERT INTO tasks (name) VALUES (?)');
  for (let i = 0; i < count; i += 1) insert.run(`task-${i}`);
  db.close();
}

function countRows(dbFile: string): number {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function listBackups(dir: string): string[] {
  try {
    return readdirSync(path.join(dir, BACKUP_DIR_NAME))
      .filter((name) => name.endsWith('.db'))
      .toSorted();
  } catch {
    return [];
  }
}

describe('backupBackendDatabase', () => {
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'backend-backup-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('skips when there is no database yet (fresh install)', () => {
    const result = backupBackendDatabase({ dataDir });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-database');
    expect(listBackups(dataDir)).toEqual([]);
  });

  it('writes a snapshot that still contains every row', () => {
    seedDatabase(dataDir, 5);

    const result = backupBackendDatabase({ dataDir });

    expect(result.skipped).toBe(false);
    expect(result.backupPath).toBeTruthy();
    expect(existsSync(result.backupPath!)).toBe(true);
    expect(countRows(result.backupPath!)).toBe(5);
    // A backup is additive: the source must come out untouched.
    expect(countRows(dbPathIn(dataDir))).toBe(5);
  });

  it('does not snapshot twice inside the throttle window', () => {
    seedDatabase(dataDir, 3);

    const first = backupBackendDatabase({ dataDir });
    const second = backupBackendDatabase({ dataDir, now: Date.now() + 60_000 });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('no-change');
    expect(listBackups(dataDir)).toHaveLength(1);
  });

  it('snapshots again once the window has passed', () => {
    seedDatabase(dataDir, 3);
    const base = 1_000_000_000_000;

    const first = backupBackendDatabase({ dataDir, now: base });
    const second = backupBackendDatabase({ dataDir, now: base + 7 * 60 * 60 * 1000 });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(false);
    expect(second.backupPath).not.toBe(first.backupPath);
    expect(listBackups(dataDir)).toHaveLength(2);
  });

  it('prunes oldest snapshots and keeps the default count', () => {
    seedDatabase(dataDir, 2);
    const base = 1_000_000_000_000;
    for (let i = 0; i < BACKUP_KEEP + 3; i += 1) {
      backupBackendDatabase({ dataDir, now: base + i * 7 * 60 * 60 * 1000 });
    }

    expect(listBackups(dataDir)).toHaveLength(BACKUP_KEEP);
  });

  it('honours an explicit keep count instead of the default', () => {
    seedDatabase(dataDir, 2);
    const base = 1_000_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      backupBackendDatabase({ dataDir, keep: 2, now: base + i * 7 * 60 * 60 * 1000 });
    }

    expect(listBackups(dataDir)).toHaveLength(2);
  });

  it('reports a failure instead of throwing, so startup survives', () => {
    seedDatabase(dataDir, 1);
    // A plain file where the backup directory must go: mkdirSync throws.
    writeFileSync(path.join(dataDir, BACKUP_DIR_NAME), 'blocking file');

    const result = backupBackendDatabase({ dataDir });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('error');
    expect(result.error).toBeTruthy();
    expect(result.backupPath).toBeUndefined();
    // The database itself is untouched by the failed attempt.
    expect(countRows(dbPathIn(dataDir))).toBe(1);
  });
});
