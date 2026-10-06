/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import path from 'path';
import { getDataPath } from '@process/utils';
import { BACKEND_DATABASE_FILENAME } from './backendDatabase';

// Re-exported so existing importers of this module keep working; the constant
// itself now lives in `backendDatabase.ts` so it can be shared without dragging
// this (mockable) module along.
export { BACKEND_DATABASE_FILENAME };

export type McpTimestampRepairResult = {
  dbPath: string;
  skipped: boolean;
  /** Timestamp columns that were inspected (and are now clean, or reported dirty). */
  repairedColumns: string[];
  convertedCreatedAt: number;
  convertedUpdatedAt: number;
  repairedUserIds: number;
};

const MCP_TIMESTAMP_COLUMNS = ['created_at', 'updated_at'] as const;

const EMPTY_RESULT = (dbPath: string): McpTimestampRepairResult => ({
  dbPath,
  skipped: true,
  repairedColumns: [],
  convertedCreatedAt: 0,
  convertedUpdatedAt: 0,
  repairedUserIds: 0,
});

/**
 * Normalize a legacy timestamp into integer milliseconds.
 *
 * The backend deserializes `mcp_servers.created_at` / `updated_at` into strict
 * `i64` fields. Any row still holding a TEXT date (e.g. `2026-03-01 10:48:38`
 * or an ISO-8601 string, written by older tooling or hand-edited rows) makes the
 * whole `GET /api/mcp/servers` query fail to deserialize, which surfaces to the
 * UI as an opaque HTTP 500 with every MCP server unreachable.
 *
 * Accepts, in order of preference:
 *  - a finite number (already milliseconds; seconds are scaled up when small)
 *  - a numeric string
 *  - a parsable date string (`YYYY-MM-DD HH:MM:SS` is treated as local time)
 *
 * Returns `null` when the value cannot be interpreted, so the caller can report
 * the row instead of silently writing garbage.
 */
export function normalizeEpochMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value <= 0) return null;
    // Heuristic: anything below ~1e11 is far too small to be a millisecond
    // epoch for a human date, so treat it as seconds.
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }

  if (typeof value === 'bigint') {
    return normalizeEpochMillis(Number(value));
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (/^-?\d+$/.test(trimmed)) {
    return normalizeEpochMillis(Number(trimmed));
  }

  // SQLite `strftime('%s', ...)` accepts "YYYY-MM-DD HH:MM:SS" and ISO-8601
  // alike; `Date.parse` only reliably handles the latter. Normalize the space
  // separator into "T" and let the platform parser do the rest.
  const isoLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? trimmed.replace(' ', 'T') : trimmed;
  const parsed = Date.parse(isoLike);
  if (Number.isNaN(parsed)) return null;

  return parsed;
}

/**
 * Repair `mcp_servers` rows that the strict backend deserializer rejects.
 *
 * Two independent defects are fixed here:
 *  1. TEXT timestamps in `created_at` / `updated_at` (the HTTP 500 cause).
 *  2. `user_id` values missing the `user_` prefix, which violate the foreign key
 *     to `users.id` and make the row unresolvable for per-user queries.
 *
 * Every statement is defensive: a missing table or column is reported as
 * "nothing to repair" rather than thrown, because a future backend schema must
 * not break app startup. The driver is opened for the duration of this one-shot
 * pass and always closed.
 */
export async function repairMcpServerTimestamps(
  dbPath = path.join(getDataPath(), BACKEND_DATABASE_FILENAME)
): Promise<McpTimestampRepairResult> {
  if (!existsSync(dbPath)) {
    return EMPTY_RESULT(dbPath);
  }

  const { BetterSqlite3Driver } = await import('@process/services/database/drivers/BetterSqlite3Driver');
  const driver = new BetterSqlite3Driver(dbPath);

  try {
    driver.exec('PRAGMA busy_timeout = 5000');

    const table = driver
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mcp_servers'`)
      .get() as { name?: string } | undefined;
    if (!table?.name) {
      return EMPTY_RESULT(dbPath);
    }

    const columns = new Set(
      ((driver.prepare(`PRAGMA table_info(mcp_servers)`).all() as Array<{ name: string }>) ?? []).map((c) => c.name)
    );

    const timestampColumns = MCP_TIMESTAMP_COLUMNS.filter((column) => columns.has(column));
    if (timestampColumns.length === 0 && !columns.has('user_id')) {
      return EMPTY_RESULT(dbPath);
    }

    const inspected: string[] = [];
    const counters: Record<(typeof MCP_TIMESTAMP_COLUMNS)[number], number> = {
      created_at: 0,
      updated_at: 0,
    };

    for (const column of timestampColumns) {
      const rows = driver
        .prepare(`SELECT rowid AS rid, ${column} AS value FROM mcp_servers WHERE typeof(${column}) = 'text'`)
        .all() as Array<{ rid: number; value: unknown }>;

      const update = driver.prepare(`UPDATE mcp_servers SET ${column} = ? WHERE rowid = ?`);
      for (const row of rows) {
        const millis = normalizeEpochMillis(row.value);
        if (millis === null) {
          // Leave unparsable values untouched — silently writing 0 would hide
          // real data loss and produce a plausible-looking wrong date.
          continue;
        }
        update.run(millis, row.rid);
        counters[column] += 1;
      }

      inspected.push(column);
    }

    let repairedUserIds = 0;
    if (columns.has('user_id')) {
      const hasUsersTable = driver
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
        .get() as { name?: string } | undefined;

      if (hasUsersTable?.name) {
        const rows = driver
          .prepare(
            `SELECT s.rowid AS rid
               FROM mcp_servers s
              WHERE s.user_id IS NOT NULL
                AND s.user_id NOT LIKE 'user!_%' ESCAPE '!'
                AND EXISTS (SELECT 1 FROM users u WHERE u.id = 'user_' || s.user_id)`
          )
          .all() as Array<{ rid: number }>;

        const update = driver.prepare(`UPDATE mcp_servers SET user_id = 'user_' || user_id WHERE rowid = ?`);
        for (const row of rows) {
          update.run(row.rid);
          repairedUserIds += 1;
        }
      }
    }

    return {
      dbPath,
      skipped: false,
      repairedColumns: inspected,
      convertedCreatedAt: counters.created_at,
      convertedUpdatedAt: counters.updated_at,
      repairedUserIds,
    };
  } finally {
    driver.close();
  }
}
