import type {
  KanbanAutomationAction,
  KanbanAutomationPlan,
  KanbanBoard,
  KanbanCard,
  KanbanPriority,
  KanbanRole,
} from '@/common/kanban/kanbanTypes';

const PRIORITIES = new Set<KanbanPriority>(['P0', 'P1', 'P2', 'P3']);

function activeCards(board: KanbanBoard): KanbanCard[] {
  return board.cards.filter((card) => !card.archived);
}

function roleById(board: KanbanBoard, roleId: string | null | undefined): KanbanRole | undefined {
  return roleId ? board.roles.find((role) => role.id === roleId) : undefined;
}

function columnById(board: KanbanBoard, columnId: string | null | undefined) {
  return columnId ? board.columns.find((column) => column.id === columnId) : undefined;
}

export function buildBoardSnapshot(board: KanbanBoard) {
  return {
    board: { id: board.id, name: board.name, description: board.description },
    columns: board.columns.map((column) => ({ id: column.id, key: column.key, name: column.name || column.key })),
    roles: board.roles.map((role) => ({
      id: role.id,
      name: role.name,
      assistant_id: role.assistant_id,
      responsibility: role.responsibility,
    })),
    cards: activeCards(board).map((card) => ({
      id: card.id,
      title: card.title,
      description: card.description,
      column_id: card.column_id,
      role_id: card.role_id,
      priority: card.priority,
      task_id: card.task_id,
    })),
  };
}

export function buildManagerPrompt(
  board: KanbanBoard,
  managerRole: KanbanRole,
  command: string,
  managerInstructions: string
): string {
  const snapshot = buildBoardSnapshot(board);
  return [
    'You are the manager agent for an AionUi Kanban board.',
    'Do not call tools, edit files, or claim that you changed anything.',
    'Analyze the user command and return a plan only. The AionUi user must approve the plan before any mutation.',
    '',
    `Board manager role: ${managerRole.name}`,
    `Manager instructions: ${managerInstructions || 'None'}`,
    `User command: ${command}`,
    '',
    'Return ONLY valid JSON with this exact shape:',
    '{"summary":"short explanation","actions":[]}',
    '',
    'Allowed action objects:',
    '{"type":"create_card","title":"...","description":"...","column_id":"...","role_id":null,"priority":"P2"}',
    '{"type":"move_card","card_id":"...","column_id":"..."}',
    '{"type":"assign_card","card_id":"...","role_id":"..."}',
    '{"type":"update_card","card_id":"...","title":"...","description":"...","priority":"P1","role_id":"..."}',
    '{"type":"archive_card","card_id":"..."}',
    '{"type":"dispatch_card","card_id":"..."}',
    '',
    'Rules:',
    '- Use only IDs present in the board snapshot.',
    '- Use at most 20 actions.',
    '- Never invent a card, role, or column.',
    '- A dispatch_card action requires an assigned role with assistant_id or team_id.',
    '- Prefer archive_card over destructive deletion.',
    '- Do not include markdown fences or commentary outside JSON.',
    '',
    'BOARD_SNAPSHOT_JSON',
    JSON.stringify(snapshot),
  ].join('\n');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The manager did not return a JSON plan.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function requireCard(board: KanbanBoard, cardId: unknown): KanbanCard {
  if (typeof cardId !== 'string') throw new Error('An action contains an invalid card id.');
  const card = activeCards(board).find((item) => item.id === cardId);
  if (!card) throw new Error(`Card ${cardId} was not found or is archived.`);
  return card;
}

function requireColumn(board: KanbanBoard, columnId: unknown) {
  if (typeof columnId !== 'string') throw new Error('An action contains an invalid column id.');
  const column = columnById(board, columnId);
  if (!column) throw new Error(`Column ${columnId} was not found.`);
  return column;
}

function validateAction(board: KanbanBoard, raw: unknown): KanbanAutomationAction {
  if (!raw || typeof raw !== 'object') throw new Error('The manager returned an invalid action.');
  const action = raw as Record<string, unknown>;
  switch (action.type) {
    case 'create_card': {
      if (typeof action.title !== 'string' || !action.title.trim()) throw new Error('create_card needs a title.');
      const column = action.column_id
        ? requireColumn(board, action.column_id)
        : board.columns.find((item) => item.key === 'triage');
      if (!column) throw new Error('The board has no Triagem column.');
      if (action.role_id != null && !roleById(board, action.role_id as string))
        throw new Error('create_card has an unknown role.');
      if (action.priority != null && !PRIORITIES.has(action.priority as KanbanPriority))
        throw new Error('create_card has an invalid priority.');
      return {
        type: 'create_card',
        title: action.title.trim(),
        description: typeof action.description === 'string' ? action.description : undefined,
        column_id: column.id,
        role_id: (action.role_id as string | null | undefined) ?? null,
        priority: (action.priority as KanbanPriority | undefined) ?? 'P2',
        workspace: typeof action.workspace === 'string' ? action.workspace : null,
      };
    }
    case 'move_card':
      requireCard(board, action.card_id);
      requireColumn(board, action.column_id);
      return { type: 'move_card', card_id: action.card_id as string, column_id: action.column_id as string };
    case 'assign_card': {
      const card = requireCard(board, action.card_id);
      if (action.role_id != null && !roleById(board, action.role_id as string))
        throw new Error('assign_card has an unknown role.');
      return { type: 'assign_card', card_id: card.id, role_id: (action.role_id as string | null | undefined) ?? null };
    }
    case 'update_card': {
      const card = requireCard(board, action.card_id);
      if (action.role_id != null && !roleById(board, action.role_id as string))
        throw new Error('update_card has an unknown role.');
      if (action.priority != null && !PRIORITIES.has(action.priority as KanbanPriority))
        throw new Error('update_card has an invalid priority.');
      const result: KanbanAutomationAction = { type: 'update_card', card_id: card.id };
      if (typeof action.title === 'string' && action.title.trim()) result.title = action.title.trim();
      if (typeof action.description === 'string') result.description = action.description;
      if (action.priority != null) result.priority = action.priority as KanbanPriority;
      if (action.role_id !== undefined) result.role_id = action.role_id as string | null;
      if (Object.keys(result).length <= 2) throw new Error('update_card has no changes.');
      return result;
    }
    case 'archive_card':
      return { type: 'archive_card', card_id: requireCard(board, action.card_id).id };
    case 'dispatch_card': {
      const card = requireCard(board, action.card_id);
      // Assignment may be an earlier action in the same approved plan; the
      // executor performs the final executable-role check while applying it.
      return { type: 'dispatch_card', card_id: card.id };
    }
    default:
      throw new Error(`Unsupported manager action: ${String(action.type)}`);
  }
}

export function parseAutomationPlan(text: string, board: KanbanBoard): KanbanAutomationPlan {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object') throw new Error('The manager returned an invalid plan.');
  const plan = raw as { summary?: unknown; actions?: unknown };
  if (typeof plan.summary !== 'string' || !Array.isArray(plan.actions))
    throw new Error('The manager plan is incomplete.');
  if (plan.actions.length > 20) throw new Error('The manager returned more than 20 actions.');
  return { summary: plan.summary.trim(), actions: plan.actions.map((action) => validateAction(board, action)) };
}

export function describeAction(action: KanbanAutomationAction, board: KanbanBoard): string {
  const card = 'card_id' in action ? board.cards.find((item) => item.id === action.card_id) : undefined;
  const column = 'column_id' in action ? columnById(board, action.column_id) : undefined;
  const role = 'role_id' in action ? roleById(board, action.role_id) : undefined;
  switch (action.type) {
    case 'create_card':
      return `Criar card “${action.title}” em ${column?.name || column?.key || 'Triagem'}${role ? `, responsável ${role.name}` : ''}.`;
    case 'move_card':
      return `Mover “${card?.title || action.card_id}” para ${column?.name || column?.key || action.column_id}.`;
    case 'assign_card':
      return `Atribuir “${card?.title || action.card_id}” para ${role?.name || 'sem responsável'}.`;
    case 'update_card':
      return `Atualizar “${card?.title || action.card_id}”.`;
    case 'archive_card':
      return `Arquivar “${card?.title || action.card_id}”.`;
    case 'dispatch_card':
      return `Despachar “${card?.title || action.card_id}”.`;
  }
}

/** Feeds both the dispatch preview and the real dispatch, so the two can never diverge. */
export function buildDispatchMission(card: KanbanCard, role?: KanbanRole): string {
  return [
    `Activity: ${card.title}`,
    role?.responsibility ? `Owner responsibility: ${role.responsibility}` : '',
    card.description,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
