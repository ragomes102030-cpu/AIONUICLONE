import { useCallback } from 'react';
import useSWR from 'swr';
import type {
  CreateKanbanBoardInput,
  CreateKanbanCardInput,
  CreateKanbanColumnInput,
  CreateKanbanRoleInput,
  DispatchKanbanCardInput,
  KanbanAPI,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanRole,
  MoveKanbanCardInput,
  UpdateKanbanBoardInput,
  UpdateKanbanCardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanRoleInput,
} from '@/common/kanban/kanbanTypes';
import { kanbanHttpApi } from './kanbanHttp';

const KANBAN_SWR_KEY = 'kanban/boards';

// The browser has no Electron preload, so it reaches the board over the same
// aioncore API the rest of the WebUI uses, authenticated by its session cookie.
function resolveApi(): KanbanAPI {
  const api = typeof window !== 'undefined' ? window.kanbanAPI : undefined;
  if (api) return api;
  if (typeof window !== 'undefined') return kanbanHttpApi;
  throw new Error('Kanban API is unavailable in this runtime');
}

export function useKanban() {
  const hasApi = typeof window !== 'undefined';
  const { data, error, isLoading, mutate } = useSWR<KanbanBoard[]>(
    hasApi ? KANBAN_SWR_KEY : null,
    () => resolveApi().list({ include_archived: true }),
    {
      refreshInterval: 2500,
      revalidateOnFocus: true,
    }
  );

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const createBoard = useCallback(
    async (input: CreateKanbanBoardInput) => {
      const result = await resolveApi().createBoard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const updateBoard = useCallback(
    async (input: UpdateKanbanBoardInput) => {
      const result = await resolveApi().updateBoard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      const result = await resolveApi().deleteBoard({ id });
      await mutate();
      return result;
    },
    [mutate]
  );

  const createRole = useCallback(
    async (input: CreateKanbanRoleInput) => {
      const result = await resolveApi().createRole(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const updateRole = useCallback(
    async (input: UpdateKanbanRoleInput) => {
      const result = await resolveApi().updateRole(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const deleteRole = useCallback(
    async (id: string) => {
      const result = await resolveApi().deleteRole({ id });
      await mutate();
      return result;
    },
    [mutate]
  );

  const createCard = useCallback(
    async (input: CreateKanbanCardInput) => {
      const result = await resolveApi().createCard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const updateCard = useCallback(
    async (input: UpdateKanbanCardInput) => {
      const result = await resolveApi().updateCard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const moveCard = useCallback(
    async (input: MoveKanbanCardInput) => {
      const result = await resolveApi().moveCard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const dispatchCard = useCallback(
    async (input: DispatchKanbanCardInput) => {
      const result = await resolveApi().dispatchCard(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const createColumn = useCallback(
    async (input: CreateKanbanColumnInput) => {
      const result = await resolveApi().createColumn(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const updateColumn = useCallback(
    async (input: UpdateKanbanColumnInput) => {
      const result = await resolveApi().updateColumn(input);
      await mutate();
      return result;
    },
    [mutate]
  );

  const deleteColumn = useCallback(
    async (id: string) => {
      const result = await resolveApi().deleteColumn({ id });
      await mutate();
      return result;
    },
    [mutate]
  );

  return {
    boards: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    hasApi,
    refresh,
    createBoard,
    updateBoard,
    deleteBoard,
    createRole,
    updateRole,
    deleteRole,
    createCard,
    updateCard,
    moveCard,
    dispatchCard,
    createColumn,
    updateColumn,
    deleteColumn,
  };
}

export type UseKanbanResult = ReturnType<typeof useKanban>;
export type { KanbanBoard, KanbanCard, KanbanColumn, KanbanRole };
