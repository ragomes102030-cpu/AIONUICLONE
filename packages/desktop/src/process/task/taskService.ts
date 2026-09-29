/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task service — owns the SQLite connection, the runner and the `task:*` IPC
 * surface exposed to the renderer.
 *
 * Started once the backend is up, because the runner needs the live aioncore
 * port and a running backend to create conversations.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { ipcMain } from 'electron';
import type { CreateTaskInput, ListTasksOptions } from '@/common/task/taskTypes';
import type {
  CreateKanbanBoardInput,
  CreateKanbanCardInput,
  CreateKanbanColumnInput,
  CreateKanbanRoleInput,
  DispatchKanbanCardInput,
  KanbanListOptions,
  MoveKanbanCardInput,
  UpdateKanbanBoardInput,
  UpdateKanbanCardInput,
  UpdateKanbanColumnInput,
  UpdateKanbanRoleInput,
} from '@/common/kanban/kanbanTypes';
import { createTask, deleteTask, ensureTaskSchema, getTask, listTasks, type TaskDatabase } from './taskRepository';
import {
  createKanbanBoard,
  createKanbanCard,
  createKanbanColumn,
  createKanbanRole,
  deleteKanbanBoard,
  deleteKanbanColumn,
  deleteKanbanRole,
  dispatchKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  moveKanbanCard,
  updateKanbanBoard,
  updateKanbanCard,
  updateKanbanColumn,
  updateKanbanRole,
} from './kanbanRepository';
import { TaskRunner } from './taskRunner';

export type TaskServiceOptions = {
  /** Absolute path of the task SQLite file. */
  dbPath: string;
  /** Resolves the live aioncore port. */
  getBackendPort: () => number;
  /** Workspace handed to conversations created without an explicit one. */
  defaultWorkspace: string;
  /** Opens the LAN surface a phone uses to reach the board. */
  kanbanHttp?: { token?: string; port?: number };
};

export type TaskServiceHandle = {
  /** Stop the runner and close the database. Safe to call more than once. */
  stop: () => void;
  /** Cancel a running/pending task (interrupts the in-flight backend turn). */
  cancel: (id: string) => Promise<void>;
  /** Port and token of the LAN board surface, when it is enabled. */
  kanbanHttp?: { port: number; token: string };
};

const TASK_CHANNELS = ['task:create', 'task:list', 'task:get', 'task:cancel', 'task:delete'] as const;
const KANBAN_CHANNELS = [
  'kanban:list',
  'kanban:board:create',
  'kanban:board:update',
  'kanban:board:delete',
  'kanban:role:create',
  'kanban:role:update',
  'kanban:role:delete',
  'kanban:card:create',
  'kanban:card:update',
  'kanban:card:move',
  'kanban:card:dispatch',
  'kanban:column:create',
  'kanban:column:update',
  'kanban:column:delete',
] as const;
const CHANNELS = [...TASK_CHANNELS, ...KANBAN_CHANNELS] as const;

/** Normalize renderer input — the mission is the only required field. */
function toCreateInput(raw: CreateTaskInput | undefined): CreateTaskInput {
  const mission = typeof raw?.mission === 'string' ? raw.mission.trim() : '';
  if (!mission) {
    throw new Error('task mission must not be empty');
  }
  return {
    mission,
    assistant_id: raw?.assistant_id ?? null,
    team_id: raw?.team_id ?? null,
    workspace: raw?.workspace ?? null,
  };
}

export function startTaskService(options: TaskServiceOptions): TaskServiceHandle {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const db: TaskDatabase = new BetterSqlite3(options.dbPath);
  ensureTaskSchema(db);
  ensureKanbanSchema(db);

  const runner = new TaskRunner({
    db,
    getBackendPort: options.getBackendPort,
    defaultWorkspace: options.defaultWorkspace,
    onTaskSettled: (task) => {
      console.log(`[TaskService] ${task.id} ${task.status}${task.error ? `: ${task.error}` : ''}`);
    },
    log: (message) => console.log(message),
  });

  ipcMain.handle('task:create', (_event, raw: CreateTaskInput | undefined) => {
    const task = createTask(db, toCreateInput(raw));
    // Kick the runner immediately so the UI does not wait a poll interval.
    void runner.runNext();
    return task;
  });

  ipcMain.handle('task:list', (_event, listOptions: ListTasksOptions | undefined) => listTasks(db, listOptions ?? {}));

  ipcMain.handle('task:get', (_event, id: string) => getTask(db, id));

  // Cancel interrupts the in-flight backend turn, marks the task `cancelled`,
  // and releases the runner on the next poll.
  ipcMain.handle('task:cancel', async (_event, id: string) => {
    const task = getTask(db, id);
    if (!task) return null;
    if (task.status === 'pending' || task.status === 'running') {
      await runner.cancelTask(id);
    }
    return getTask(db, id);
  });

  ipcMain.handle('task:delete', async (_event, id: string) => {
    const task = getTask(db, id);
    // A running task must interrupt the backend turn BEFORE the row is
    // removed, so no orphaned turn keeps consuming resources.
    if (task && task.status === 'running') {
      await runner.cancelTask(id);
    }
    deleteTask(db, id);
    return true;
  });

  ipcMain.handle('kanban:list', (_event, kanbanOptions?: KanbanListOptions) => listKanbanBoards(db, kanbanOptions));
  ipcMain.handle('kanban:board:create', (_event, input: CreateKanbanBoardInput) => createKanbanBoard(db, input));
  ipcMain.handle('kanban:board:update', (_event, input: UpdateKanbanBoardInput) => updateKanbanBoard(db, input));
  ipcMain.handle('kanban:board:delete', (_event, id: string) => deleteKanbanBoard(db, id));
  ipcMain.handle('kanban:role:create', (_event, input: CreateKanbanRoleInput) => createKanbanRole(db, input));
  ipcMain.handle('kanban:role:update', (_event, input: UpdateKanbanRoleInput) => updateKanbanRole(db, input));
  ipcMain.handle('kanban:role:delete', (_event, id: string) => deleteKanbanRole(db, id));
  ipcMain.handle('kanban:card:create', (_event, input: CreateKanbanCardInput) => createKanbanCard(db, input));
  ipcMain.handle('kanban:card:update', (_event, input: UpdateKanbanCardInput) => updateKanbanCard(db, input));
  ipcMain.handle('kanban:card:move', (_event, input: MoveKanbanCardInput) => moveKanbanCard(db, input));
  ipcMain.handle('kanban:card:dispatch', (_event, input: DispatchKanbanCardInput) => {
    const result = dispatchKanbanCard(db, { ...input, workspace_root: options.defaultWorkspace });
    void runner.runNext();
    return result;
  });
  ipcMain.handle('kanban:column:create', (_event, input: CreateKanbanColumnInput) => createKanbanColumn(db, input));
  ipcMain.handle('kanban:column:update', (_event, input: UpdateKanbanColumnInput) => updateKanbanColumn(db, input));
  ipcMain.handle('kanban:column:delete', (_event, id: string) => deleteKanbanColumn(db, id));

  runner.start();

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      runner.stop();
      for (const channel of CHANNELS) {
        ipcMain.removeHandler(channel);
      }
      db.close();
    },
    cancel: async (id: string) => {
      const task = getTask(db, id);
      if (!task) return;
      if (task.status === 'pending' || task.status === 'running') {
        await runner.cancelTask(id);
      }
    },
  };
}
