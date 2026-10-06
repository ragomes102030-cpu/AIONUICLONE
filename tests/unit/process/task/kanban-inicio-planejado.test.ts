/**
 * Planned start date, persisted end to end.
 *
 * Runs against a real SQLite file so the schema migration is exercised for
 * real: a column that exists in the type but not in the table is exactly the
 * kind of defect that only shows up at runtime.
 */

import BetterSqlite3 from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  updateKanbanCard,
  type KanbanDatabase,
} from '@process/task/kanbanRepository';

const DAY = 24 * 60 * 60 * 1000;
// Fixed Monday 28/09/2026 12:00 UTC. A test that reads the wall clock passes on
// the day it was written and fails a week later.
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);

const dbDir = mkdtempSync(join(tmpdir(), 'kanban-inicio-'));
const dbPath = join(dbDir, `kanban-${randomUUID()}.db`);

let db: KanbanDatabase;
let boardId: string;
let columnId: string;

const mk = (title: string, extra: Record<string, unknown> = {}) =>
  createKanbanCard(db, {
    board_id: boardId,
    column_id: columnId,
    title,
    ...extra,
  } as Parameters<typeof createKanbanCard>[2]);

const card = (id: string) => listKanbanBoards(db)[0].cards.find((c) => c.id === id)!;

describe('servico com inicio planejado e prazo', () => {
  beforeAll(() => {
    db = new BetterSqlite3(dbPath);
    ensureKanbanSchema(db);
    const board = listKanbanBoards(db)[0];
    boardId = board.id;
    columnId = board.columns.find((c) => c.key === 'scheduled')!.id;
  });

  afterAll(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('guarda a data de inicio planejado junto com o prazo', () => {
    const criado = mk('Comecar antes de terminar', { start_for: NOW + 2 * DAY, scheduled_for: NOW + 5 * DAY });
    expect(card(criado.id).start_for).toBe(NOW + 2 * DAY);
    expect(card(criado.id).scheduled_for).toBe(NOW + 5 * DAY);

    updateKanbanCard(db, { id: criado.id, start_for: NOW + 3 * DAY });
    expect(card(criado.id).start_for).toBe(NOW + 3 * DAY);
  });

  it('aceita servico so com prazo, sem inicio planejado', () => {
    const soPrazo = mk('So com data de fim', { scheduled_for: NOW + 5 * DAY });
    expect(card(soPrazo.id).start_for).toBeNull();
    expect(card(soPrazo.id).scheduled_for).toBe(NOW + 5 * DAY);
  });
});
