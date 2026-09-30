import type {
  CreateKanbanBoardInput,
  CreateKanbanCardInput,
  CreateKanbanColumnInput,
  CreateKanbanRoleInput,
  DeleteKanbanBoardInput,
  DeleteKanbanBoardResult,
  DeleteKanbanColumnInput,
  DeleteKanbanRoleInput,
  DispatchKanbanCardInput,
  DispatchKanbanCardResult,
  KanbanAPI,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanListOptions,
  KanbanRole,
  MoveKanbanCardInput,
  UpdateKanbanBoardInput,
  UpdateKanbanCardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanRoleInput,
} from '@/common/kanban/kanbanTypes';

const FIELD_DESKTOP_ONLY =
  'This Kanban action is only available in the desktop app. From the field you can read the board, record start/finish and move cards.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/kanban${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Kanban request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const data = typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : payload;
  return data as T;
}

export const kanbanHttpApi: KanbanAPI = {
  list: (_options?: KanbanListOptions): Promise<KanbanBoard[]> => request<KanbanBoard[]>('/board'),

  updateCard: (input: UpdateKanbanCardInput) =>
    request<KanbanCard>('/card', { method: 'PATCH', body: JSON.stringify(input) }),

  moveCard: (input: MoveKanbanCardInput) =>
    request<KanbanCard>('/card/move', { method: 'PATCH', body: JSON.stringify(input) }),

  createBoard: (_input: CreateKanbanBoardInput): Promise<KanbanBoard> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  updateBoard: (_input: UpdateKanbanBoardInput): Promise<KanbanBoard> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  deleteBoard: (_input: DeleteKanbanBoardInput): Promise<DeleteKanbanBoardResult> =>
    Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  createRole: (_input: CreateKanbanRoleInput): Promise<KanbanRole> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  updateRole: (_input: UpdateKanbanRoleInput): Promise<KanbanRole> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  deleteRole: (_input: DeleteKanbanRoleInput): Promise<boolean> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  createCard: (_input: CreateKanbanCardInput): Promise<KanbanCard> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  dispatchCard: (_input: DispatchKanbanCardInput): Promise<DispatchKanbanCardResult> =>
    Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  createColumn: (_input: CreateKanbanColumnInput): Promise<KanbanColumn> =>
    Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  updateColumn: (_input: UpdateKanbanColumnInput): Promise<KanbanColumn> =>
    Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
  deleteColumn: (_input: DeleteKanbanColumnInput): Promise<boolean> => Promise.reject(new Error(FIELD_DESKTOP_ONLY)),
};
