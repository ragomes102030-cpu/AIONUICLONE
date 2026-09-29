import { describe, expect, it } from 'vitest';
import type { KanbanBoard } from '@/common/kanban/kanbanTypes';
import { buildDispatchMission, buildManagerPrompt, parseAutomationPlan } from '@renderer/pages/kanban/boardAutomation';

const board: KanbanBoard = {
  id: 'board-1',
  name: 'Obra Norte',
  description: 'Planejamento',
  archived: false,
  manager_role_id: 'role-1',
  manager_instructions: 'Priorize P0.',
  columns: [
    { id: 'col-triage', board_id: 'board-1', key: 'triage', name: '', position: 0, color: '#000', system: true },
    { id: 'col-running', board_id: 'board-1', key: 'running', name: '', position: 1, color: '#000', system: true },
  ],
  roles: [
    {
      id: 'role-1',
      board_id: 'board-1',
      name: 'Arquiteto',
      assistant_id: 'assistant-1',
      team_id: null,
      responsibility: 'Planejar.',
      color: '#000',
      position: 0,
      created_at: 1,
      updated_at: 1,
    },
  ],
  cards: [
    {
      id: 'card-1',
      board_id: 'board-1',
      column_id: 'col-triage',
      title: 'Revisar Agents.md',
      description: '',
      priority: 'P2',
      role_id: 'role-1',
      task_id: null,
      workspace: null,
      position: 0,
      archived: false,
      scheduled_for: null,
      started_at: null,
      finished_at: null,
      not_done_reason: null,
      created_at: 1,
      updated_at: 1,
    },
  ],
  created_at: 1,
  updated_at: 1,
};

describe('boardAutomation', () => {
  it('builds a manager prompt with the board snapshot and constraints', () => {
    const prompt = buildManagerPrompt(board, board.roles[0], 'mova o card', board.manager_instructions);
    expect(prompt).toContain('mova o card');
    expect(prompt).toContain('card-1');
    expect(prompt).toContain('dispatch_card');
    expect(prompt).toContain('must approve');
  });

  it('parses a valid plan and validates IDs', () => {
    const plan = parseAutomationPlan(
      JSON.stringify({
        summary: 'Mover e despachar',
        actions: [
          { type: 'move_card', card_id: 'card-1', column_id: 'col-running' },
          { type: 'dispatch_card', card_id: 'card-1' },
        ],
      }),
      board
    );
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].type).toBe('move_card');
    expect(plan.actions[1].type).toBe('dispatch_card');
  });

  it('rejects invented IDs and fenced output is accepted', () => {
    expect(() =>
      parseAutomationPlan(
        JSON.stringify({
          summary: 'bad',
          actions: [{ type: 'move_card', card_id: 'invented', column_id: 'col-running' }],
        }),
        board
      )
    ).toThrow(/not found/i);
    expect(
      parseAutomationPlan(
        '```json\n{"summary":"ok","actions":[{"type":"archive_card","card_id":"card-1"}]}\n```',
        board
      ).actions
    ).toHaveLength(1);
  });
});

describe('buildDispatchMission', () => {
  it('includes the role responsibility and card description', () => {
    const card = { ...board.cards[0], description: 'Montar a EAP do apto 2.' };
    const mission = buildDispatchMission(card, board.roles[0]);
    expect(mission).toContain('Activity: Revisar Agents.md');
    expect(mission).toContain('Owner responsibility: Planejar.');
    expect(mission).toContain('Montar a EAP do apto 2.');
  });

  it('omits the responsibility line when the role has none', () => {
    const mission = buildDispatchMission(board.cards[0], { ...board.roles[0], responsibility: '' });
    expect(mission).not.toContain('Owner responsibility');
    expect(mission).toBe('Activity: Revisar Agents.md');
  });

  it('works without a role and never emits stray blank separators', () => {
    const card = { ...board.cards[0], description: 'Sem papel e com descricao.' };
    const mission = buildDispatchMission(card, undefined);
    expect(mission).toBe('Activity: Revisar Agents.md\n\nSem papel e com descricao.');
    expect(mission).not.toContain('\n\n\n');
  });
});
