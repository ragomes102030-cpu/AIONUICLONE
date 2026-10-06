/**
 * E2E do Kanban com atividades de uma obra.
 *
 * Caminho real: criar quadro -> criar papeis -> criar atividades -> declarar
 * PREDECESSORAS -> derivar status pelo prazo -> propagar atraso -> despachar
 * (cria e liga a task) -> mover/arquivar -> reabrir o banco em disco e conferir
 * que tudo sobreviveu.
 *
 * O banco e um arquivo temporario (nao :memory:) de proposito: o objetivo e
 * provar persistencia de ponta a ponta.
 */
import BetterSqlite3 from 'better-sqlite3';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveScheduleStatus,
  effectiveDeadline,
  isCardAtRisk,
  rankByImpact,
  type KanbanBoard,
} from '@/common/kanban/kanbanTypes';
import {
  createKanbanCard,
  createKanbanRole,
  dispatchKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  moveKanbanCard,
  setKanbanCardDependencies,
  updateKanbanCard,
} from '@process/task/kanbanRepository';
import { ensureTaskSchema, getTask, listTasks, type TaskDatabase } from '@process/task/taskRepository';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Diretorio proprio por execucao: dois workers do vitest compartilham o mesmo
// process.pid, entao o nome do banco precisa de um sufixo unico por processo de
// teste. Sem isso, arquivos temporarios colidem e o Node derruba o worker com
// um crash nativo. Tambem por isso o afterAll fecha o banco antes de apagar.
const dbDir = mkdtempSync(join(tmpdir(), 'kanban-e2e-'));
const dbPath = join(dbDir, `kanban-${randomUUID()}.db`);

describe('Kanban de ponta a ponta com atividades de obra', () => {
  let db: TaskDatabase;
  let board: KanbanBoard;
  let ids: Record<string, string>;
  let roleId: string;

  // Relogio fixo: segunda-feira 28/09/2026 12:00 UTC. Testes de prazo que
  // derivam datas de Date.now() quebram quando a janela due_soon (24 h) ou a
  // regra de dias uteis desloca o prazo efetivo. Aqui o "agora" e uma
  // constante, entao o calendario nao move nada entre execucoes.
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);
  const by = (id: string) => board.cards.find((c) => c.id === id)!;
  const reload = () => {
    board = listKanbanBoards(db)[0];
    return board;
  };

  beforeAll(() => {
    db = new BetterSqlite3(dbPath);
    ensureTaskSchema(db);
    ensureKanbanSchema(db);
    board = listKanbanBoards(db)[0];

    roleId = createKanbanRole(db, {
      board_id: board.id,
      name: 'Planejador',
      responsibility: 'Consere prazos e sequencias',
    }).id;

    const mk = (title: string, extra: Record<string, unknown> = {}) =>
      createKanbanCard(db, {
        board_id: board.id,
        column_id: board.columns.find((c) => c.key === 'scheduled')!.id,
        title,
        description: `Servico: ${title}`,
        ...extra,
      } as Parameters<typeof createKanbanCard>[2]);

    ids = {
      fundacao: mk('Fundacao - LOC', { priority: 'P0', scheduled_for: now - 2 * DAY, assignee: 'Braga' }).id,
      pilares: mk('Estrutura - pilares', { priority: 'P0', scheduled_for: now + 3 * DAY, assignee: 'Sousa' }).id,
      vigas: mk('Estrutura - vigas', { priority: 'P1', scheduled_for: now + 5 * DAY }).id,
      eletrica: mk('Instalacoes eletricas', { priority: 'P1', scheduled_for: now + 5 * DAY }).id,
      cobertura: mk('Cobertura', { priority: 'P2', scheduled_for: now + 8 * DAY }).id,
      pintura: mk('Pintura', { priority: 'P2', scheduled_for: now + 10 * DAY }).id,
      contrapiso: mk('Fundacao - contrapiso', {
        priority: 'P0',
        scheduled_for: now - 5 * DAY,
        assignee: 'Braga',
      }).id,
      argamassa: mk('Argamassa - vencendo', { priority: 'P1', scheduled_for: now + 10 * HOUR }).id,
    };

    setKanbanCardDependencies(db, ids.pilares, [ids.fundacao]);
    setKanbanCardDependencies(db, ids.vigas, [ids.pilares]);
    setKanbanCardDependencies(db, ids.eletrica, [ids.pilares]);
    setKanbanCardDependencies(db, ids.cobertura, [ids.vigas, ids.eletrica]);
    setKanbanCardDependencies(db, ids.pintura, [ids.cobertura]);
    // contrapiso (atrasada e nao iniciada) segura as eletricas
    setKanbanCardDependencies(db, ids.eletrica, [ids.pilares, ids.contrapiso]);
    reload();
  });

  afterAll(() => {
    db?.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('1. cria o quadro com 8 colunas, papeis e as 8 atividades', () => {
    expect(board.columns.map((c) => c.key)).toEqual([
      'triage',
      'todo',
      'scheduled',
      'ready',
      'running',
      'review',
      'done',
      'blocked',
    ]);
    expect(board.roles.map((r) => r.name)).toEqual(['Planejador']);
    expect(roleId).toBeTruthy();
    expect(board.cards).toHaveLength(8);
    const fundacao = by(ids.fundacao);
    expect(fundacao.priority).toBe('P0');
    expect(fundacao.assignee).toBe('Braga');
    expect(fundacao.depends_on).toEqual([]);
  });

  it('2. registra a sequencia declarada entre as atividades', () => {
    reload();
    expect(by(ids.fundacao).depends_on).toEqual([]);
    expect(by(ids.pilares).depends_on).toEqual([ids.fundacao]);
    expect(by(ids.vigas).depends_on).toEqual([ids.pilares]);
    expect(by(ids.cobertura).depends_on.slice().sort()).toEqual([ids.vigas, ids.eletrica].slice().sort());
    expect(by(ids.pintura).depends_on).toEqual([ids.cobertura]);
  });
  it('3. deriva o status de cada atividade a partir do prazo', () => {
    reload();
    // prazo passado e sem inicio -> atrasada
    expect(deriveScheduleStatus(by(ids.fundacao), board.columns, now)).toBe('overdue');
    // dentro do prazo, com a janela explicita: 3 dias ainda e "agendado"
    expect(deriveScheduleStatus(by(ids.pilares), board.columns, now, 24)).toBe('scheduled');
    expect(deriveScheduleStatus(by(ids.pintura), board.columns, now, 24)).toBe('scheduled');
    // dentro da janela de aviso (24 h): "vencendo", nao "agendado"
    expect(deriveScheduleStatus(by(ids.argamassa), board.columns, now, 24)).toBe('due_soon');
    // janela desligada: o mesmo cartao volta a ser "agendado"
    expect(deriveScheduleStatus(by(ids.argamassa), board.columns, now, 0)).toBe('scheduled');

    // em execucao
    updateKanbanCard(db, { id: ids.pintura, started_at: now - HOUR });
    reload();
    expect(deriveScheduleStatus(by(ids.pintura), board.columns, now)).toBe('in_progress');

    // entregue depois do prazo -> terminou atrasado
    updateKanbanCard(db, {
      id: ids.fundacao,
      started_at: now - 4 * DAY,
      finished_at: now - 1 * DAY,
    });
    reload();
    expect(deriveScheduleStatus(by(ids.fundacao), board.columns, now)).toBe('late_finish');

    // movida para "done" sem atraso -> concluida
    moveKanbanCard(db, {
      id: ids.cobertura,
      column_id: board.columns.find((c) => c.key === 'done')!.id,
      position: 0,
    });
    reload();
    expect(deriveScheduleStatus(by(ids.cobertura), board.columns, now)).toBe('done');
  });

  it('4. propaga o atraso de quem ainda esta atrasado (nao de quem ja entregou)', () => {
    reload();
    const map = new Map(board.cards.map((c) => [c.id, c]));
    // As eletricas dependem do contrapiso, que esta ATRASADO e nao comecou -> em risco
    expect(deriveScheduleStatus(by(ids.contrapiso), board.columns, now)).toBe('overdue');
    expect(isCardAtRisk(by(ids.eletrica), map, board.columns, now)).toBe(true);

    // pilares depende da Fundacao, que JA ENTREGOU (ate atrasada): nao segura mais ninguem
    expect(deriveScheduleStatus(by(ids.fundacao), board.columns, now)).toBe('late_finish');
    expect(isCardAtRisk(by(ids.pilares), map, board.columns, now)).toBe(false);

    // Sem dependencia nao ha risco
    expect(isCardAtRisk(by(ids.contrapiso), map, board.columns, now)).toBe(false);

    // Servico parado na coluna de bloqueio tambem e risco, mesmo sem atraso.
    // A cobertura estava em "done"; concluida nunca esta "em risco", entao volta
    // para a coluna agendada antes de exercitar o bloqueio da viga.
    const col = (key: string) => board.columns.find((c) => c.key === key)!.id;
    moveKanbanCard(db, { id: ids.cobertura, column_id: col('scheduled'), position: 0 });
    moveKanbanCard(db, { id: ids.vigas, column_id: col('blocked'), position: 0 });
    reload();
    expect(isCardAtRisk(by(ids.cobertura), new Map(board.cards.map((c) => [c.id, c])), board.columns, now)).toBe(true);
    // restaura o estado
    moveKanbanCard(db, { id: ids.cobertura, column_id: col('done'), position: 0 });
    moveKanbanCard(db, { id: ids.vigas, column_id: col('scheduled'), position: 0 });
    reload();
  });

  it('5. aponta o que esta segurando o quadro, do maior impacto para o menor', () => {
    reload();
    const impacto = rankByImpact(board.cards, board.columns, now);
    expect(impacto.length).toBeGreaterThan(0);
    for (let i = 1; i < impacto.length; i += 1) {
      expect(impacto[i - 1].blocksCount).toBeGreaterThanOrEqual(impacto[i].blocksCount);
    }
    // Concluidas nao entram na lista de "o que perseguir"
    const idsImpacto = impacto.map((i) => i.card_id);
    expect(idsImpacto).not.toContain(ids.cobertura);
    // A contrapiso esta atrasada e segura as eletricas
    expect(idsImpacto).toContain(ids.contrapiso);
    const contrapiso = impacto.find((i) => i.card_id === ids.contrapiso)!;
    expect(contrapiso.blocksCount).toBeGreaterThan(0);
  });

  it('6. despacha uma atividade e cria a task ligada', () => {
    reload();
    const result = dispatchKanbanCard(db, {
      card_id: ids.vigas,
      mission: 'Activity: Estrutura - vigas\n\nRegistrar o progresso diario.',
      workspace_root: 'C:/obra/demo',
    });
    expect(result.task.id).toMatch(/^task-/);
    expect(result.reused).toBe(false);

    const task = getTask(db, result.task.id)!;
    expect(task.status).toBe('pending');
    // o despacho cria uma pasta propria por cartao dentro do workspace do quadro
    expect(task.workspace.replace(/\\/g, '/')).toMatch(/^C:\/obra\/demo\/kanban\//);

    reload();
    expect(by(ids.vigas).task_id).toBe(task.id);

    // re-despachar reaproveita a task em vez de duplicar
    const again = dispatchKanbanCard(db, {
      card_id: ids.vigas,
      mission: 'de novo',
      workspace_root: 'C:/obra/demo',
    });
    expect(again.reused).toBe(true);
    expect(again.task.id).toBe(task.id);
    expect(listTasks(db, { limit: 50 })).toHaveLength(1);
  });

  it('7. recalcula o prazo respeitando dias nao uteis', () => {
    const sabado = new Date(2026, 8, 5, 12, 0, 0).getTime();
    expect(new Date(sabado).getDay()).toBe(6);
    const sexta = effectiveDeadline(sabado);
    expect(new Date(sexta).getDay()).toBe(5);
    expect(sexta).toBeLessThan(sabado);
  });

  it('8. reabrir o banco em disco preserva quadro, atividades e sequencia', () => {
    const antes = reload();
    db.close();

    const db2 = new BetterSqlite3(dbPath);
    ensureTaskSchema(db2);
    ensureKanbanSchema(db2);
    const depois = listKanbanBoards(db2)[0];
    const find = (id: string) => depois.cards.find((c) => c.id === id)!;

    expect(depois.cards).toHaveLength(8);
    expect(find(ids.pilares).depends_on).toEqual([ids.fundacao]);
    expect(find(ids.cobertura).depends_on.slice().sort()).toEqual([ids.vigas, ids.eletrica].slice().sort());
    expect(find(ids.vigas).task_id).toBeTruthy();
    expect(depois.columns.map((c) => c.key)).toEqual(antes.columns.map((c) => c.key));
    expect(listTasks(db2, { limit: 50 })).toHaveLength(1);
    db2.close();

    db = new BetterSqlite3(dbPath);
  });
});
