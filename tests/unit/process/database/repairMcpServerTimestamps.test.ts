/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression coverage for the `GET /api/mcp/servers` HTTP 500.
 *
 * The backend deserializes `mcp_servers.created_at` / `updated_at` into strict
 * `i64` fields, so a single row holding a TEXT date makes the whole listing
 * query fail. These tests run against a real SQLite file (better-sqlite3) so
 * the `typeof(...)` predicate — the exact thing that misbehaved — is exercised
 * for real rather than mocked away.
 */

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BACKEND_DATABASE_FILENAME,
  normalizeEpochMillis,
  repairMcpServerTimestamps,
} from '@process/services/database/repairMcpServerTimestamps';

let workDir = '';
let dbPath = '';

const SEED_SQL = `
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
`;

type Row = { id: string; user_id: string; created_at: unknown; updated_at: unknown };

/**
 * better-sqlite3 turns `PRAGMA foreign_keys` ON by default. These tests must be
 * able to plant the very violations the repair exists to fix, so seeding runs
 * with enforcement disabled; the assertion then re-enables it for the check.
 */
function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = OFF');
    return fn(db);
  } finally {
    db.close();
  }
}

function withForeignKeysEnforced<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = ON');
    return fn(db);
  } finally {
    db.close();
  }
}

function seed(rows: Array<[string, string, string, unknown, unknown]>): void {
  withDb((db) => {
    for (const [id, userId, name, createdAt, updatedAt] of rows) {
      db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(userId);
      db.prepare('INSERT INTO mcp_servers (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        id,
        userId,
        name,
        createdAt,
        updatedAt
      );
    }
  });
}

function insertMcp(
  db: Database.Database,
  id: string,
  userId: string,
  name: string,
  createdAt: unknown,
  updatedAt: unknown
) {
  db.prepare('INSERT INTO mcp_servers (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    userId,
    name,
    createdAt,
    updatedAt
  );
}

function readAll(): Row[] {
  return withDb(
    (db) => db.prepare('SELECT id, user_id, created_at, updated_at FROM mcp_servers ORDER BY id').all() as Row[]
  );
}

function foreignKeyViolations(): unknown[] {
  return withForeignKeysEnforced((db) => db.pragma('foreign_key_check') as unknown[]);
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'aionui-mcp-repair-'));
  dbPath = path.join(workDir, BACKEND_DATABASE_FILENAME);
  withDb((db) => db.exec(SEED_SQL));
});

describe('normalizeEpochMillis', () => {
  it('parses the SQLite "YYYY-MM-DD HH:MM:SS" form written by legacy tooling', () => {
    expect(normalizeEpochMillis('2026-03-01 10:48:38')).toBe(new Date('2026-03-01T10:48:38').getTime());
  });

  it('parses ISO-8601 with fractional seconds', () => {
    expect(normalizeEpochMillis('2026-09-26T14:35:09.614949')).toBe(new Date('2026-09-26T14:35:09.614').getTime());
  });

  it('scales seconds up to milliseconds but leaves milliseconds untouched', () => {
    expect(normalizeEpochMillis(1_772_000_000)).toBe(1_772_000_000_000);
    expect(normalizeEpochMillis(1_772_000_000_000)).toBe(1_772_000_000_000);
  });

  it('accepts numeric strings', () => {
    expect(normalizeEpochMillis('1772000000000')).toBe(1_772_000_000_000);
  });

  it('refuses values that would silently corrupt the record', () => {
    expect(normalizeEpochMillis(null)).toBeNull();
    expect(normalizeEpochMillis(undefined)).toBeNull();
    expect(normalizeEpochMillis('')).toBeNull();
    expect(normalizeEpochMillis('   ')).toBeNull();
    expect(normalizeEpochMillis('not-a-date')).toBeNull();
    expect(normalizeEpochMillis(0)).toBeNull();
    expect(normalizeEpochMillis(-5)).toBeNull();
    expect(normalizeEpochMillis(Number.NaN)).toBeNull();
  });
});

describe('repairMcpServerTimestamps', () => {
  it('converts TEXT timestamps to integer milliseconds', async () => {
    seed([
      ['mcp_1', 'user_a', 'a', '2026-03-01 10:48:38', '2026-03-02 11:00:00'],
      ['mcp_2', 'user_a', 'b', 1_772_000_000_000, 1_772_000_000_000],
    ]);

    const result = await repairMcpServerTimestamps(dbPath);

    expect(result.convertedCreatedAt).toBe(1);
    expect(result.convertedUpdatedAt).toBe(1);

    const rows = readAll();
    const first = rows.find((row) => row.id === 'mcp_1');
    expect(typeof first?.created_at).toBe('number');
    expect(first?.created_at).toBe(new Date('2026-03-01T10:48:38').getTime());
    // Untouched integer row must be bit-identical — no reformatting.
    expect(rows.find((row) => row.id === 'mcp_2')?.created_at).toBe(1_772_000_000_000);
  });

  it('is idempotent: a second pass converts nothing', async () => {
    seed([['mcp_1', 'user_a', 'a', '2026-03-01 10:48:38', '2026-03-02 11:00:00']]);

    await repairMcpServerTimestamps(dbPath);
    const second = await repairMcpServerTimestamps(dbPath);

    expect(second.convertedCreatedAt).toBe(0);
    expect(second.convertedUpdatedAt).toBe(0);
  });

  it('leaves unparsable TEXT values untouched instead of writing 0', async () => {
    seed([['mcp_1', 'user_a', 'a', 'corrupted-value', 'also-corrupted']]);

    const result = await repairMcpServerTimestamps(dbPath);

    expect(result.convertedCreatedAt).toBe(0);
    expect(result.convertedUpdatedAt).toBe(0);
    const row = readAll()[0];
    expect(row.created_at).toBe('corrupted-value');
    expect(row.updated_at).toBe('also-corrupted');
  });

  it('restores the missing user_ prefix so the foreign key resolves', async () => {
    withDb((db) => {
      db.prepare('INSERT INTO users (id) VALUES (?)').run('user_01a0a66a-a860-7f32-a93c-9e0a44813e42');
      insertMcp(
        db,
        'mcp_1790347635287',
        '01a0a66a-a860-7f32-a93c-9e0a44813e42',
        'render',
        1_772_000_000_000,
        1_772_000_000_000
      );
    });

    const result = await repairMcpServerTimestamps(dbPath);

    expect(result.repairedUserIds).toBe(1);
    expect(readAll()[0].user_id).toBe('user_01a0a66a-a860-7f32-a93c-9e0a44813e42');
    expect(foreignKeyViolations()).toHaveLength(0);
  });

  it('does not invent a user_ prefix for an id that has no matching user', async () => {
    seed([['mcp_1', 'user_a', 'a', 1, 1]]);
    withDb((db) => db.prepare('UPDATE mcp_servers SET user_id = ? WHERE id = ?').run('orphan-id', 'mcp_1'));

    const result = await repairMcpServerTimestamps(dbPath);

    expect(result.repairedUserIds).toBe(0);
    expect(readAll()[0].user_id).toBe('orphan-id');
  });

  it('clears PRAGMA foreign_key_check violations on a realistic production row set', async () => {
    // The exact production shape: 20 rows with TEXT dates plus one with a
    // broken foreign key — the combination that took the endpoint down.
    withDb((db) => {
      db.prepare('INSERT INTO users (id) VALUES (?)').run('user_01a0a66a-a860-7f32-a93c-9e0a44813e42');
      for (let i = 0; i < 20; i += 1) {
        insertMcp(
          db,
          `mcp_${i}`,
          'user_01a0a66a-a860-7f32-a93c-9e0a44813e42',
          `server-${i}`,
          '2026-03-01 10:48:38',
          '2026-03-02 11:00:00'
        );
      }
      insertMcp(
        db,
        'mcp_render',
        '01a0a66a-a860-7f32-a93c-9e0a44813e42',
        'render',
        '2026-03-01 10:48:38',
        '2026-03-02 11:00:00'
      );
    });

    expect(foreignKeyViolations()).toHaveLength(1);

    const result = await repairMcpServerTimestamps(dbPath);

    expect(result.convertedCreatedAt).toBe(21);
    expect(result.convertedUpdatedAt).toBe(21);
    expect(result.repairedUserIds).toBe(1);
    expect(foreignKeyViolations()).toHaveLength(0);

    // The decisive assertion: no TEXT timestamp survives anywhere, which is
    // exactly the condition under which the backend stops returning HTTP 500.
    const textTimestamps = withDb(
      (db) =>
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM mcp_servers
              WHERE typeof(created_at) = 'text' OR typeof(updated_at) = 'text'`
          )
          .get() as { n: number }
    );
    expect(textTimestamps.n).toBe(0);
  });

  it('skips cleanly when the catalog has no mcp_servers table', async () => {
    const bare = path.join(workDir, 'bare.db');
    const db = new Database(bare);
    db.exec('CREATE TABLE unrelated (id TEXT)');
    db.close();

    const result = await repairMcpServerTimestamps(bare);

    expect(result.skipped).toBe(true);
    expect(result.convertedCreatedAt).toBe(0);
  });

  it('skips cleanly when the database file does not exist', async () => {
    const result = await repairMcpServerTimestamps(path.join(workDir, 'missing.db'));

    expect(result.skipped).toBe(true);
  });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});
