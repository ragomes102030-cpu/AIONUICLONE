import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveScheduleStatus, effectiveDeadline, isCardAtRisk, rankByImpact } from '@/common/kanban/kanbanTypes';
import {
  createKanbanCard,
  createKanbanRole,
  deleteKanbanBoard,
  dispatchKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  moveKanbanCard,
  setKanbanCardDependencies,
  updateKanbanBoard,
  updateKanbanCard,
} from '@process/task/kanbanRepository';
import { ensureTaskSchema, getTask, listTasks, type TaskDatabase } from '@process/task/taskRepository';

describe('kanbanRepository', () => {
  let db: TaskDatabase;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    ensureTaskSchema(db);
    ensureKanbanSchema(db);
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('creates a default board with the built-in workflow columns', () => {
    const boards = listKanbanBoards(db);
    expect(boards).toHaveLength(1);
    expect(boards[0].columns.map((column) => column.key)).toEqual([
      'triage',
      'todo',
      'scheduled',
      'ready',
      'running',
      'review',
      'done',
      'blocked',
    ]);
  });

  it('renames and deletes a board while preserving task rows', () => {
    const board = listKanbanBoards(db)[0];
    const renamed = updateKanbanBoard(db, { id: board.id, name: 'Board renamed' });
    expect(renamed.name).toBe('Board renamed');
    const card = createKanbanCard(db, { board_id: board.id, column_id: board.columns[0].id, title: 'Preserve task' });
    const dispatched = dispatchKanbanCard(db, { card_id: card.id, mission: 'Keep task history' });
    const result = deleteKanbanBoard(db, board.id);
    expect(result.deleted).toBe(true);
    expect(result.cards).toBe(1);
    expect(getTask(db, dispatched.task.id)?.id).toBe(dispatched.task.id);
    expect(listKanbanBoards(db)).toHaveLength(1);
  });

  it('persists a local role and card, then dispatches and links one task', () => {
    const board = listKanbanBoards(db)[0];
    const role = createKanbanRole(db, {
      board_id: board.id,
      name: 'Arquiteto',
      assistant_id: 'assistant-1',
      responsibility: 'Desenhar a solução.',
    });
    const card = createKanbanCard(db, {
      board_id: board.id,
      column_id: board.columns[0].id,
      title: 'Definir arquitetura',
      description: 'Levantar restrições e decidir a abordagem.',
      role_id: role.id,
    });

    const first = dispatchKanbanCard(db, {
      card_id: card.id,
      mission: 'Definir arquitetura',
      assistant_id: role.assistant_id,
      column_id: board.columns.find((column) => column.key === 'running')?.id,
    });
    expect(first.reused).toBe(false);
    expect(first.card.task_id).toBe(first.task.id);
    expect(getTask(db, first.task.id)?.assistant_id).toBe('assistant-1');

    const second = dispatchKanbanCard(db, {
      card_id: card.id,
      mission: 'Não deve criar outra task',
      assistant_id: role.assistant_id,
    });
    expect(second.reused).toBe(true);
    expect(second.task.id).toBe(first.task.id);
    expect(listTasks(db)).toHaveLength(1);
  });

  it('moves cards between columns and archives them without deleting task history', () => {
    const board = listKanbanBoards(db)[0];
    const triage = board.columns[0];
    const done = board.columns.find((column) => column.key === 'done');
    expect(done).toBeDefined();
    const card = createKanbanCard(db, {
      board_id: board.id,
      column_id: triage.id,
      title: 'Card de teste',
    });

    const moved = moveKanbanCard(db, { id: card.id, column_id: done!.id });
    expect(moved.column_id).toBe(done!.id);
    const archived = updateKanbanCard(db, { id: card.id, archived: true });
    expect(archived.archived).toBe(true);
    expect(listKanbanBoards(db)[0].cards.find((item) => item.id === card.id)?.archived).toBe(true);
  });

  // A field service is committed to a time, not to a workflow stage: the crew
  // marks when it actually started and finished, and "overdue" is what the clock
  // says, never something anyone moves a card to express.
  describe('schedule commitment and the receipt the field hands back', () => {
    const HOUR = 60 * 60 * 1000;

    function boardWithColumn() {
      const board = listKanbanBoards(db)[0];
      const scheduled = board.columns.find((column) => column.key === 'scheduled')!;
      return { board, scheduled };
    }

    it('reads back a commitment and the receipt without losing either', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;

      const created = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Retirada de entulho',
        scheduled_for: at,
      });
      expect(created.scheduled_for).toBe(at);
      expect(created.started_at).toBeNull();
      expect(created.finished_at).toBeNull();

      const started = updateKanbanCard(db, { id: created.id, started_at: at + 4 * 60 * 1000 });
      expect(started.started_at).toBe(at + 4 * 60 * 1000);

      const finished = updateKanbanCard(db, { id: created.id, finished_at: at + 5 * HOUR });
      expect(finished.finished_at).toBe(at + 5 * HOUR);
      expect(finished.scheduled_for).toBe(at);
    });

    it('reports a service as overdue once its time passes with nobody started', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Assentamento de piso',
        scheduled_for: at,
      });

      const columns = listKanbanBoards(db)[0].columns;
      expect(deriveScheduleStatus(card, columns, at - 25 * HOUR)).toBe('scheduled');
      expect(deriveScheduleStatus(card, columns, at - HOUR)).toBe('due_soon');
      expect(deriveScheduleStatus(card, columns, at)).toBe('overdue');
      expect(deriveScheduleStatus(card, columns, at + 3 * HOUR)).toBe('overdue');
    });

    it('keeps warning when a service started and then ran past its date', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const created = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Locação da obra',
        scheduled_for: at,
      });

      // Started before the date, checked two hours after it. This is the case
      // that used to be swallowed: `started_at` returned in_progress before the
      // deadline was ever compared, so a service could start on time and then
      // drift for weeks while the board reported it healthy.
      const started = updateKanbanCard(db, { id: created.id, started_at: at - 30 * 60 * 1000 });
      expect(deriveScheduleStatus(started, listKanbanBoards(db)[0].columns, at + 2 * HOUR)).toBe('overdue');
    });

    it('leaves a started service that is still inside its window as in progress', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const created = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Iniciado dentro da janela',
        scheduled_for: at,
      });
      const started = updateKanbanCard(db, { id: created.id, started_at: at - 30 * 60 * 1000 });

      // Two days out, so the 24h warning has not opened. Starting work must not
      // mean the service is due soon — that would flag the whole board.
      expect(deriveScheduleStatus(started, listKanbanBoards(db)[0].columns, at - 40 * HOUR)).toBe('in_progress');
    });

    it('warns a started service that is about to run out of time', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const created = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Iniciado e vencendo',
        scheduled_for: at,
      });
      const started = updateKanbanCard(db, { id: created.id, started_at: at - 2 * HOUR });

      // Underway with an hour left is the warning the site actually needs, so
      // being started no longer suppresses it.
      expect(deriveScheduleStatus(started, listKanbanBoards(db)[0].columns, at - 60 * 60 * 1000)).toBe('due_soon');
    });

    it('keeps the reason when a service is closed without finishing', () => {
      const { board, scheduled } = boardWithColumn();
      const created = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Falta de container',
        scheduled_for: 1_800_000_000_000,
      });

      const closed = updateKanbanCard(db, { id: created.id, not_done_reason: '  sem container no canteiro  ' });
      expect(closed.not_done_reason).toBe('sem container no canteiro');
    });

    it('leaves an unscheduled card out of the overdue bucket', () => {
      const { board, scheduled } = boardWithColumn();
      const card = createKanbanCard(db, { board_id: board.id, column_id: scheduled.id, title: 'Sem prazo' });
      expect(deriveScheduleStatus(card, listKanbanBoards(db)[0].columns, 1_800_000_000_000)).toBe('not_started');
    });

    it('warns about a service before its clock runs out, not after', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Contrapiso a vencer',
        scheduled_for: at,
      });
      const columns = listKanbanBoards(db)[0].columns;

      expect(deriveScheduleStatus(card, columns, at - 25 * HOUR)).toBe('scheduled');
      expect(deriveScheduleStatus(card, columns, at - 23 * HOUR)).toBe('due_soon');
      expect(deriveScheduleStatus(card, columns, at + HOUR)).toBe('overdue');
    });

    it('separates a service that finished after its time from one that finished on time', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const late = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Contrapiso que estourou o horario',
        scheduled_for: at,
      });
      const onTime = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Contrapiso no horario',
        scheduled_for: at,
      });
      const lateDone = updateKanbanCard(db, { id: late.id, started_at: at - HOUR, finished_at: at + 2 * HOUR });
      const onTimeDone = updateKanbanCard(db, { id: onTime.id, started_at: at - HOUR, finished_at: at - HOUR });
      const columns = listKanbanBoards(db)[0].columns;

      expect(deriveScheduleStatus(lateDone, columns, at + 3 * HOUR)).toBe('late_finish');
      expect(deriveScheduleStatus(onTimeDone, columns, at + 3 * HOUR)).toBe('done');
    });

    it('calls a service finished exactly on its time done, not late', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Terminou no limite',
        scheduled_for: at,
      });
      const finished = updateKanbanCard(db, { id: card.id, started_at: at - HOUR, finished_at: at });

      expect(deriveScheduleStatus(finished, listKanbanBoards(db)[0].columns, at + HOUR)).toBe('done');
    });

    it('keeps a late finish visible even after the card is moved to done', () => {
      const board = listKanbanBoards(db)[0];
      const scheduled = board.columns.find((c) => c.key === 'scheduled')!;
      const done = board.columns.find((c) => c.key === 'done')!;
      const at = 1_800_000_000_000;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Atrasado movido para concluidos',
        scheduled_for: at,
      });
      updateKanbanCard(db, { id: card.id, started_at: at - HOUR, finished_at: at + 2 * HOUR });
      const moved = moveKanbanCard(db, { id: card.id, column_id: done.id });

      expect(deriveScheduleStatus(moved, listKanbanBoards(db)[0].columns, at + 5 * HOUR)).toBe('late_finish');
    });

    describe('a site that rests on weekends', () => {
      const SATURDAY = new Date('2026-09-26T12:00:00').getTime();
      const FRIDAY = new Date('2026-09-25T12:00:00').getTime();
      const MONDAY = new Date('2026-09-28T09:00:00').getTime();

      function weekendCard() {
        const { board, scheduled } = boardWithColumn();
        return createKanbanCard(db, {
          board_id: board.id,
          column_id: scheduled.id,
          title: 'Servico prometido para sabado',
          scheduled_for: SATURDAY,
        });
      }

      it('pulls a weekend deadline back to the last working day', () => {
        expect(effectiveDeadline(SATURDAY)).toBe(FRIDAY);
      });

      it('treats the weekend as already late, because the real deadline was Friday', () => {
        const card = weekendCard();
        const columns = listKanbanBoards(db)[0].columns;

        expect(deriveScheduleStatus(card, columns, FRIDAY + HOUR)).toBe('overdue');
        expect(deriveScheduleStatus(card, columns, SATURDAY + 2 * HOUR)).toBe('overdue');
        expect(deriveScheduleStatus(card, columns, MONDAY + HOUR)).toBe('overdue');
      });

      it('still warns before the weekend arrives, when the decision can be made', () => {
        const card = weekendCard();
        const columns = listKanbanBoards(db)[0].columns;

        expect(deriveScheduleStatus(card, columns, FRIDAY - 12 * HOUR)).toBe('due_soon');
        expect(deriveScheduleStatus(card, columns, FRIDAY - 30 * HOUR)).toBe('scheduled');
      });

      it('judges a finish against the working day, not the rest day', () => {
        const card = weekendCard();
        const columns = listKanbanBoards(db)[0].columns;
        const finishedSaturday = updateKanbanCard(db, {
          id: card.id,
          started_at: FRIDAY - 2 * HOUR,
          finished_at: SATURDAY,
        });
        const finishedMonday = updateKanbanCard(db, {
          id: card.id,
          started_at: FRIDAY - 2 * HOUR,
          finished_at: MONDAY + HOUR,
        });

        expect(deriveScheduleStatus(finishedSaturday, columns, MONDAY)).toBe('late_finish');
        expect(deriveScheduleStatus(finishedMonday, columns, MONDAY + 2 * HOUR)).toBe('late_finish');
      });

      it('leaves a deadline on a working day untouched', () => {
        const fridayDeadline = new Date('2026-10-02T17:00:00').getTime();
        expect(effectiveDeadline(fridayDeadline)).toBe(fridayDeadline);
      });
    });

    it('keeps a card visible as late when it sits in blocked with a finish time', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const blocked = board.columns.find((column) => column.key === 'blocked')!;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Reboco parado de novo',
        scheduled_for: at,
      });
      updateKanbanCard(db, { id: card.id, started_at: at - 2 * HOUR, finished_at: at - HOUR });
      const moved = moveKanbanCard(db, { id: card.id, column_id: blocked.id });

      expect(deriveScheduleStatus(moved, listKanbanBoards(db)[0].columns, at)).toBe('late_finish');
    });

    it('honours a different warning window when one is given', () => {
      const { board, scheduled } = boardWithColumn();
      const at = 1_800_000_000_000;
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Janela de 72h',
        scheduled_for: at,
      });
      const columns = listKanbanBoards(db)[0].columns;

      expect(deriveScheduleStatus(card, columns, at - 48 * HOUR, 72)).toBe('due_soon');
      expect(deriveScheduleStatus(card, columns, at - 48 * HOUR, 24)).toBe('scheduled');
    });

    it('treats a card sitting in the done column as finished', () => {
      const { board, scheduled } = boardWithColumn();
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: scheduled.id,
        title: 'Concluído por coluna',
        scheduled_for: 1_800_000_000_000,
      });

      const reloaded = listKanbanBoards(db)[0];
      const done = reloaded.columns.find((column) => column.key === 'done')!;
      const movedCard = moveKanbanCard(db, { id: card.id, column_id: done.id });
      expect(deriveScheduleStatus(movedCard, reloaded.columns, 1_800_000_000_000 + HOUR)).toBe('done');
    });
  });

  // The crew is not the agent: a service is executed by people on site, and it
  // is the crew the delay belongs to. A late predecessor puts the services that
  // wait on it at risk, which is propagation, not prediction.
  describe('field assignee, closed reasons and dependency risk', () => {
    const HOUR = 60 * 60 * 1000;
    const NOW = 1_800_000_000_000;

    function seed() {
      const board = listKanbanBoards(db)[0];
      const byKey = new Map(board.columns.map((column) => [column.key, column.id]));
      return { board, byKey };
    }

    it('stores the crew on site separately from the agent role', () => {
      const { board, byKey } = seed();
      const role = createKanbanRole(db, { board_id: board.id, name: 'Hermes E2E', assistant_id: 'assistant-1' });

      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Assentamento de piso',
        role_id: role.id,
        assignee: 'Zezinho e Luizinho',
      });

      const reloaded = listKanbanBoards(db)[0].cards.find((item) => item.id === card.id)!;
      expect(reloaded.assignee).toBe('Zezinho e Luizinho');
      expect(reloaded.role_id).toBe(role.id);
    });

    it('counts a delay reason from a closed vocabulary', () => {
      const { board, byKey } = seed();
      const card = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('blocked')!,
        title: 'Contrapiso',
        assignee: 'Zezinho e Luizinho',
      });

      const closed = updateKanbanCard(db, { id: card.id, reason_code: 'material', not_done_reason: 'sem cimento' });
      expect(closed.reason_code).toBe('material');
    });

    it('remembers what a service waits on', () => {
      const { board, byKey } = seed();
      const first = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Contrapiso',
      });
      const second = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('todo')!,
        title: 'Cerâmico',
      });

      setKanbanCardDependencies(db, second.id, [first.id]);
      const reloaded = listKanbanBoards(db)[0].cards.find((item) => item.id === second.id)!;
      expect(reloaded.depends_on).toEqual([first.id]);
    });

    it('flags a service as at risk when the one it waits on is already late', () => {
      const { board, byKey } = seed();
      const predecessor = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Contrapiso atrasado',
        scheduled_for: NOW - 2 * HOUR,
      });
      const dependent = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('todo')!,
        title: 'Cerâmico dependente',
        scheduled_for: NOW + HOUR,
      });
      setKanbanCardDependencies(db, dependent.id, [predecessor.id]);

      const reloaded = listKanbanBoards(db)[0];
      const byId = new Map(reloaded.cards.map((card) => [card.id, card]));
      expect(isCardAtRisk(byId.get(dependent.id)!, byId, reloaded.columns, NOW)).toBe(true);
    });

    it('keeps the risk while a delayed predecessor is still running', () => {
      const { board, byKey } = seed();
      const predecessor = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Contrapiso',
        scheduled_for: NOW - 2 * HOUR,
      });
      const dependent = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('todo')!,
        title: 'Cerâmico',
        scheduled_for: NOW + HOUR,
      });
      setKanbanCardDependencies(db, dependent.id, [predecessor.id]);
      updateKanbanCard(db, { id: predecessor.id, started_at: NOW - 30 * 60 * 1000 });

      // A crew picking up a two-hour-late job does not unblock whoever is
      // waiting on it. It used to: starting flipped the predecessor to
      // in_progress, which is not `overdue`, so the dependency silently stopped
      // counting as a blocker.
      const reloaded = listKanbanBoards(db)[0];
      const byId = new Map(reloaded.cards.map((card) => [card.id, card]));
      expect(isCardAtRisk(byId.get(dependent.id)!, byId, reloaded.columns, NOW)).toBe(true);
    });

    it('flags a running service that is late and waiting on something late', () => {
      const { board, byKey } = seed();
      const predecessor = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Contrapiso',
        scheduled_for: NOW - 2 * HOUR,
      });
      const running = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('running')!,
        title: 'Já em execução',
        scheduled_for: NOW - 2 * HOUR,
      });
      setKanbanCardDependencies(db, running.id, [predecessor.id]);
      updateKanbanCard(db, { id: running.id, started_at: NOW - HOUR });

      // Being in the running column is not a reason to stay quiet: this one is
      // two hours late and blocked on something two hours late. The old rule
      // bailed out on `own === 'in_progress'` before ever looking at the
      // dependencies, which is the same suppression as the status bug one layer
      // up.
      const reloaded = listKanbanBoards(db)[0];
      const byId = new Map(reloaded.cards.map((card) => [card.id, card]));
      expect(isCardAtRisk(byId.get(running.id)!, byId, reloaded.columns, NOW)).toBe(true);
    });

    it('does not flag a running service that is still inside its window', () => {
      const { board, byKey } = seed();
      const predecessor = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Contrapiso atrasado',
        scheduled_for: NOW - 2 * HOUR,
      });
      const running = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('running')!,
        title: 'Em execução dentro do prazo',
        scheduled_for: NOW + 3 * 24 * HOUR,
      });
      setKanbanCardDependencies(db, running.id, [predecessor.id]);
      updateKanbanCard(db, { id: running.id, started_at: NOW - HOUR });

      // Underway and not late: the late predecessor still does not make this one
      // late. The warning follows the service's own date, not its column.
      const reloaded = listKanbanBoards(db)[0];
      const byId = new Map(reloaded.cards.map((card) => [card.id, card]));
      expect(isCardAtRisk(byId.get(running.id)!, byId, reloaded.columns, NOW)).toBe(false);
    });

    describe('what a late service is holding up', () => {
      const HOUR = 60 * 60 * 1000;
      const NOW = 1_800_000_000_000;

      function load() {
        const boards = listKanbanBoards(db)[0];
        return { columns: boards.columns, cards: boards.cards };
      }

      it('counts everything a late service is transitively blocking', () => {
        const { board, byKey } = seed();
        const a = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Contrapiso atrasado',
          scheduled_for: NOW - 2 * HOUR,
        });
        const b = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Ceranico' });
        const c = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Pintura' });
        const d = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Limpeza' });
        setKanbanCardDependencies(db, b.id, [a.id]);
        setKanbanCardDependencies(db, c.id, [b.id]);
        setKanbanCardDependencies(db, d.id, [c.id]);

        const { columns, cards } = load();
        const impact = rankByImpact(cards, columns, NOW).find((item) => item.card_id === a.id);
        expect(impact?.blocksCount).toBe(3);
      });

      it('puts the service holding up the most work at the top', () => {
        const { board, byKey } = seed();
        const hub = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Estrutura atrasada',
          scheduled_for: NOW - 2 * HOUR,
        });
        const solo = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Atrasado sem ninguem esperando',
          scheduled_for: NOW - 2 * HOUR,
        });
        for (let i = 0; i < 3; i += 1) {
          const dependent = createKanbanCard(db, {
            board_id: board.id,
            column_id: byKey.get('todo')!,
            title: `Dependente ${i}`,
          });
          setKanbanCardDependencies(db, dependent.id, [hub.id]);
        }

        const { columns, cards } = load();
        const ranked = rankByImpact(cards, columns, NOW);
        expect(ranked[0].card_id).toBe(hub.id);
        expect(ranked.some((item) => item.card_id === solo.id)).toBe(true);
      });

      it('reports which late predecessors a service is waiting on', () => {
        const { board, byKey } = seed();
        const late = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Contrapiso atrasado',
          scheduled_for: NOW - 2 * HOUR,
        });
        const ok = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Locacao no prazo',
          scheduled_for: NOW + 2 * HOUR,
        });
        const dependent = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('todo')!,
          title: 'Ceranico',
        });
        setKanbanCardDependencies(db, dependent.id, [late.id, ok.id]);

        const { columns, cards } = load();
        const impact = rankByImpact(cards, columns, NOW).find((item) => item.card_id === dependent.id);
        expect(impact?.lateDependencies).toEqual([late.id]);
      });

      it('keeps a diamond from counting the shared descendant twice', () => {
        const { board, byKey } = seed();
        const late = createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Base atrasada',
          scheduled_for: NOW - 2 * HOUR,
        });
        const left = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Esquerda' });
        const right = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Direita' });
        const bottom = createKanbanCard(db, { board_id: board.id, column_id: byKey.get('todo')!, title: 'Fundo' });
        setKanbanCardDependencies(db, left.id, [late.id]);
        setKanbanCardDependencies(db, right.id, [late.id]);
        setKanbanCardDependencies(db, bottom.id, [left.id, right.id]);

        const { columns, cards } = load();
        const impact = rankByImpact(cards, columns, NOW).find((item) => item.card_id === late.id);
        expect(impact?.blocksCount).toBe(3);
      });

      it('survives a dependency cycle instead of looping forever', () => {
        const { columns, cards } = load();
        const cyclic = [
          { ...cards[0], depends_on: ['b'] },
          { ...cards[1], id: 'b', title: 'B', depends_on: ['a'], scheduled_for: NOW - 2 * HOUR },
        ].filter((card) => card.id);

        expect(() => rankByImpact(cyclic, columns, NOW)).not.toThrow();
      });

      it('leaves a board with nothing late out of the list', () => {
        const { board, byKey } = seed();
        createKanbanCard(db, {
          board_id: board.id,
          column_id: byKey.get('scheduled')!,
          title: 'Tudo no prazo',
          scheduled_for: NOW + 5 * HOUR,
        });

        const { columns, cards } = load();
        expect(rankByImpact(cards, columns, NOW)).toHaveLength(0);
      });
    });

    it('leaves a service with no dependencies out of the risk bucket', () => {
      const { board, byKey } = seed();
      const lonely = createKanbanCard(db, {
        board_id: board.id,
        column_id: byKey.get('scheduled')!,
        title: 'Sem dependencia',
        scheduled_for: NOW - 5 * HOUR,
      });

      const reloaded = listKanbanBoards(db)[0];
      const byId = new Map(reloaded.cards.map((card) => [card.id, card]));
      expect(isCardAtRisk(byId.get(lonely.id)!, byId, reloaded.columns, NOW)).toBe(false);
    });
  });

  describe('where the files of a dispatched card are kept', () => {
    it('gives each card its own folder under the board', () => {
      const board = listKanbanBoards(db)[0];
      const scheduled = board.columns.find((column) => column.key === 'scheduled')!;
      const first = createKanbanCard(db, { board_id: board.id, column_id: scheduled.id, title: 'Contrapiso' });
      const second = createKanbanCard(db, { board_id: board.id, column_id: scheduled.id, title: 'Cerâmico' });

      const a = dispatchKanbanCard(db, { card_id: first.id, mission: 'Levantar', workspace_root: '/ws' });
      const b = dispatchKanbanCard(db, { card_id: second.id, mission: 'Levantar', workspace_root: '/ws' });

      expect(a.task.workspace).not.toBe(b.task.workspace);
      expect(a.task.workspace).toContain('contrapiso');
      expect(b.task.workspace).toContain('ceramico');
      expect(a.task.workspace).toContain(first.id);
      expect(b.task.workspace).toContain(second.id);
    });

    it('remembers the folder on the card so it survives a reload', () => {
      const board = listKanbanBoards(db)[0];
      const scheduled = board.columns.find((column) => column.key === 'scheduled')!;
      const card = createKanbanCard(db, { board_id: board.id, column_id: scheduled.id, title: 'Contrapiso' });

      const dispatched = dispatchKanbanCard(db, { card_id: card.id, mission: 'Levantar', workspace_root: '/ws' });
      const reloaded = listKanbanBoards(db)[0].cards.find((item) => item.id === card.id)!;
      expect(reloaded.workspace).toBe(dispatched.task.workspace);
    });

    it('never overrides a folder the user typed by hand', () => {
      const board = listKanbanBoards(db)[0];
      const scheduled = board.columns.find((column) => column.key === 'scheduled')!;
      const card = createKanbanCard(db, { board_id: board.id, column_id: scheduled.id, title: 'Contrapiso' });

      const dispatched = dispatchKanbanCard(db, {
        card_id: card.id,
        mission: 'Levantar',
        workspace: 'C:/minha-pasta',
        workspace_root: '/ws',
      });
      expect(dispatched.task.workspace).toBe('C:/minha-pasta');
    });
  });
});
