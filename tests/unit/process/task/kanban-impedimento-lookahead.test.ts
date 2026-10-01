/**
 * Planned start, impediment tracking and the weekly lookahead.
 *
 * These run against a real SQLite file so the schema migration is exercised for
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
  blockedAgeDays,
  filterByLookahead,
  isWithinLookahead,
  lookaheadAnchor,
} from '@/common/kanban/kanbanTypes';
import {
  createKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  updateKanbanCard,
  type KanbanDatabase,
} from '@process/task/kanbanRepository';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Fixed Monday 28/09/2026 12:00 UTC. A lookahead test that reads the wall clock
// passes on the day it was written and fails a week later.
const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);

const dbDir = mkdtempSync(join(tmpdir(), 'kanban-lean-'));
const dbPath = join(dbDir, `kanban-${randomUUID()}.db`);

let db: KanbanDatabase;
let boardId: string;
let columnId: string;
const ids: Record<string, string> = {};

const mk = (title: string, extra: Record<string, unknown> = {}) =>
  createKanbanCard(db, {
    board_id: boardId,
    column_id: columnId,
    title,
    ...extra,
  } as Parameters<typeof createKanbanCard>[2]);

const card = (id: string) => listKanbanBoards(db)[0].cards.find((c) => c.id === id)!;

describe('servico com inicio planejado, impedimento e lookahead', () => {
  beforeAll(() => {
    db = new BetterSqlite3(dbPath);
    ensureKanbanSchema(db);
    const board = listKanbanBoards(db)[0];
    boardId = board.id;
    columnId = board.columns.find((c) => c.key === 'scheduled')!.id;

    ids.janela = mk('Vencimento dentro da janela', { start_for: NOW + 2 * DAY, scheduled_for: NOW + 5 * DAY }).id;
    ids.longe = mk('Vencimento fora da janela', { start_for: NOW + 20 * DAY, scheduled_for: NOW + 30 * DAY }).id;
    ids.atrasado = mk('Ja vencido', { scheduled_for: NOW - 3 * DAY }).id;
    ids.travado = mk('Travado por material', {
      scheduled_for: NOW + DAY,
      blocked_reason: 'material',
      blocked_since: NOW - 6 * DAY,
    }).id;
    ids.concluido = mk('Ja entregue', { scheduled_for: NOW + DAY }).id;
    ids.semData = mk('Sem prazo nenhum', {}).id;
    // Sits between the one-week and the two-week window, so narrowing the
    // lookahead has something real to remove.
    ids.meio = mk('Vence entre 1 e 2 semanas', { start_for: NOW + 10 * DAY }).id;

    // `finished_at` is not part of the create input — a service cannot be born
    // already delivered. It is recorded after creation, like on site.
    updateKanbanCard(db, { id: ids.concluido, started_at: NOW - DAY, finished_at: NOW - HOUR });
  });

  afterAll(() => {
    db?.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('1. guarda a data de inicio planejado junto com o prazo', () => {
    const servico = card(ids.janela);
    expect(servico.start_for).toBe(NOW + 2 * DAY);
    expect(servico.scheduled_for).toBe(NOW + 5 * DAY);

    updateKanbanCard(db, { id: ids.janela, start_for: NOW + 3 * DAY });
    expect(card(ids.janela).start_for).toBe(NOW + 3 * DAY);
  });

  it('2. guarda o impedimento e diz ha quantos dias ele existe', () => {
    const servico = card(ids.travado);
    expect(servico.blocked_reason).toBe('material');
    expect(servico.blocked_since).toBe(NOW - 6 * DAY);

    expect(blockedAgeDays(servico, NOW)).toBe(6);
    // Same service, a week later: the impediment aged, it did not reset.
    expect(blockedAgeDays(servico, NOW + 7 * DAY)).toBe(13);
    // A card nobody blocked reports no age instead of zero.
    expect(blockedAgeDays(card(ids.janela), NOW)).toBeNull();
    // A clock skew must never produce a negative age.
    expect(blockedAgeDays({ blocked_since: NOW + DAY }, NOW)).toBe(0);
  });

  it('3. limpa o impedimento quando ele deixa de existir', () => {
    updateKanbanCard(db, { id: ids.travado, blocked_reason: null, blocked_since: null });

    const servico = card(ids.travado);
    expect(servico.blocked_reason).toBeNull();
    expect(servico.blocked_since).toBeNull();
    expect(blockedAgeDays(servico, NOW)).toBeNull();
  });

  it('4. a janela de lookahead usa o inicio planejado quando existe', () => {
    expect(lookaheadAnchor(card(ids.janela))).toBe(NOW + 3 * DAY);
    // Without a planned start it falls back to the deadline.
    expect(lookaheadAnchor(card(ids.atrasado))).toBe(NOW - 3 * DAY);
    expect(lookaheadAnchor(card(ids.semData))).toBeNull();
  });

  it('5. a janela traz o que vence, adia o que esta longe e nunca esconde atraso', () => {
    const duasSemanas = filterByLookahead(listKanbanBoards(db)[0].cards, NOW, 2).map((c) => c.id);

    expect(duasSemanas).toContain(ids.janela); // vence dentro
    expect(duasSemanas).toContain(ids.travado); // vence dentro
    expect(duasSemanas).toContain(ids.atrasado); // JA VENCIDO continua na pauta
    expect(duasSemanas).not.toContain(ids.longe); // 20 dias fora
    expect(duasSemanas).not.toContain(ids.concluido); // entregue nao se discute
    expect(duasSemanas).not.toContain(ids.semData); // sem data nao da para escalar
  });

  it('6. estreitar a janela retira o que estava fora dela', () => {
    const umaSemana = filterByLookahead(listKanbanBoards(db)[0].cards, NOW, 1).map((c) => c.id);
    const duasSemanas = filterByLookahead(listKanbanBoards(db)[0].cards, NOW, 2).map((c) => c.id);

    expect(umaSemana).not.toContain(ids.meio);
    expect(duasSemanas).toContain(ids.meio);
    expect(umaSemana.length).toBeLessThan(duasSemanas.length);
    for (const id of umaSemana) expect(duasSemanas).toContain(id);
  });

  it('7. servico arquivado nunca entra na pauta', () => {
    // 20 days out: outside a one-week lookahead, inside a four-week one. The
    // window grows forward from now, so widening it can only ever add cards.
    expect(isWithinLookahead(card(ids.longe), NOW, 1)).toBe(false);
    expect(isWithinLookahead(card(ids.longe), NOW, 4)).toBe(true);

    updateKanbanCard(db, { id: ids.longe, archived: true });
    const arquivado = { ...card(ids.longe), start_for: NOW + HOUR };
    expect(isWithinLookahead(arquivado, NOW, 4)).toBe(false);
  });
});
