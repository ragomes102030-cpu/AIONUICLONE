import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { deriveScheduleStatus, rankByImpact } from '@/common/kanban/kanbanTypes';
import {
  createKanbanCard,
  createKanbanColumn,
  createKanbanRole,
  dispatchKanbanCard,
  listKanbanBoards,
  moveKanbanCard,
  setKanbanCardDependencies,
  updateKanbanCard,
} from '@process/task/kanbanRepository';
import { ensureTaskSchema } from '@process/task/taskRepository';

const HOUR = 3600_000;

describe('a obra vista de ponta a ponta', () => {
  it('acompanha um servico do prazo ate a conclusao, com quem depende dele', () => {
    const db = new BetterSqlite3(':memory:');
    ensureTaskSchema(db);

    const board = listKanbanBoards(db)[0];
    const byKey = new Map(board.columns.map((c) => [c.key, c.id]));
    const now = 1_800_000_000_000;

    const role = createKanbanRole(db, { board_id: board.id, name: 'Hermes E2E', assistant_id: 'bare:55f3ed1c' });
    const contrapiso = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('scheduled')!,
      title: 'Contrapiso apto 2',
      assignee: 'Zezinho e Luizinho',
      scheduled_for: now - 2 * HOUR,
    });
    const ceranico = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('todo')!,
      title: 'Assentamento de piso',
      assignee: 'Zezinho e Luizinho',
      // Four days out, past the 72h warning window: the "fine" state this test
    // needs must not sit on the edge of a constant that changes.
    scheduled_for: now + 4 * 24 * HOUR,
    });
    setKanbanCardDependencies(db, ceranico.id, [contrapiso.id]);

    let b = listKanbanBoards(db)[0];
    const reler = (id: string) => b.cards.find((c) => c.id === id)!;
    const status = (id: string) => deriveScheduleStatus(reler(id), b.columns, now);

    expect(status(contrapiso.id)).toBe('overdue');
    expect(status(ceranico.id)).toBe('scheduled');

    let ranked = rankByImpact(b.cards, b.columns, now);
    expect(ranked[0].card_id).toBe(contrapiso.id);
    expect(ranked[0].blocksCount).toBe(1);

    b = listKanbanBoards(db)[0];
    expect(status(contrapiso.id)).toBe('overdue');
    expect(ranked.map((r) => r.card_id)).toContain(ceranico.id);

    updateKanbanCard(db, { id: contrapiso.id, started_at: now - HOUR });
    b = listKanbanBoards(db)[0];
    // Starting work does not undo the lateness. It used to: the board went
    // quiet the moment a crew touched the card, which meant the alert died
    // exactly when the service was still behind. It stays overdue until it is
    // finished, and then it is judged as a late finish.
    expect(status(contrapiso.id)).toBe('overdue');

    updateKanbanCard(db, { id: contrapiso.id, finished_at: now + HOUR });
    b = listKanbanBoards(db)[0];
    expect(status(contrapiso.id)).toBe('late_finish');
    expect(
      rankByImpact(b.cards, b.columns, now).filter((r) => r.card_id === contrapiso.id && r.blocksCount > 0)
    ).toHaveLength(0);

    const moved = moveKanbanCard(db, { id: contrapiso.id, column_id: byKey.get('done')! });
    expect(moved.column_id).toBe(byKey.get('done'));

    const dispatched = dispatchKanbanCard(db, {
      card_id: ceranico.id,
      mission: 'Levantar a medicao de frente do assentamento',
      assistant_id: role.assistant_id,
      workspace_root: 'C:/ws',
    });
    expect(dispatched.reused).toBe(false);
    expect(dispatched.card.task_id).toBe(dispatched.task.id);
    expect(dispatched.task.workspace).toContain('assentamento-de-piso');
    expect(dispatched.task.workspace).toContain(ceranico.id);

    const again = dispatchKanbanCard(db, { card_id: ceranico.id, mission: 'outra', workspace_root: 'C:/ws' });
    expect(again.reused).toBe(true);
    expect(again.task.id).toBe(dispatched.task.id);

    const noPrazo = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('scheduled')!,
      title: 'Pintura fora da janela de aviso',
      assignee: 'Pintor',
      scheduled_for: now + 5 * 24 * HOUR,
    });
    // Friday 08:00 + 23h lands on Saturday, a rest day, so the effective deadline
    // is pulled back to Friday and the service is already late. The window test
    // needs a deadline that survives on a working day.
    const breve = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('scheduled')!,
      title: 'Caixilha da janela',
      scheduled_for: now + 23 * HOUR,
    });
    b = listKanbanBoards(db)[0];
    expect(deriveScheduleStatus(b.cards.find((c) => c.id === breve.id)!, b.columns, now)).toBe('overdue');
    const emJanela = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('scheduled')!,
      title: 'Servico dentro da janela de aviso',
      scheduled_for: now + 2 * HOUR,
    });
    b = listKanbanBoards(db)[0];
    expect(deriveScheduleStatus(b.cards.find((c) => c.id === emJanela.id)!, b.columns, now)).toBe('due_soon');
    const parado = createKanbanCard(db, {
      board_id: board.id,
      column_id: byKey.get('scheduled')!,
      title: 'Servico parado com recibo antigo',
      scheduled_for: now - 4 * HOUR,
    });
    updateKanbanCard(db, { id: parado.id, started_at: now - 5 * HOUR, finished_at: now - 3 * HOUR });
    const paradoBloqueado = moveKanbanCard(db, { id: parado.id, column_id: byKey.get('blocked')! });

    b = listKanbanBoards(db)[0];
    expect(deriveScheduleStatus(b.cards.find((c) => c.id === noPrazo.id)!, b.columns, now)).toBe('scheduled');
    expect(deriveScheduleStatus(paradoBloqueado, b.columns, now)).toBe('late_finish');
    expect(rankByImpact(b.cards, b.columns, now).map((r) => r.card_id)).not.toContain(noPrazo.id);

    // A service parked in the history column is out of the decision list but
    // still readable, so the record of what happened survives.
    const historico = createKanbanColumn(db, { board_id: board.id, name: 'Finalizados' });
    db.prepare('UPDATE kanban_columns SET key = ? WHERE id = ?').run('finalizados', historico.id);
    const finalizados = createKanbanCard(db, {
      board_id: board.id,
      column_id: historico.id,
      title: 'Escavacao concluida no mes passado',
      assignee: 'Equipe B',
      scheduled_for: now - 30 * 24 * HOUR,
    });
    const finalizadoComRecibo = updateKanbanCard(db, {
      id: finalizados.id,
      started_at: now - 31 * 24 * HOUR,
      finished_at: now - 30 * 24 * HOUR,
    });
    b = listKanbanBoards(db)[0];
    const colunas = b.columns;
    expect(deriveScheduleStatus(finalizadoComRecibo, colunas, now)).toBe('archived');
    expect(rankByImpact(b.cards, colunas, now).map((r) => r.card_id)).not.toContain(finalizados.id);
    expect(b.cards.find((c) => c.id === finalizados.id)?.title).toBe('Escavacao concluida no mes passado');

    db.close();
  });
});
