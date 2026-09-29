/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * SQLite-backed task store — the single source of truth for task persistence.
 * Callers own the connection lifetime; this module only reads and writes rows.
 */

import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CreateTaskInput, ListTasksOptions, Task, TaskStatus } from '@/common/task/taskTypes';

export type TaskDatabase = Database.Database;

const TASK_COLUMNS =
  'id, mission, status, agent_id, assistant_id, team_id, workspace, result, error, created_at, started_at, completed_at';

type TaskRow = {
  id: string;
  mission: string;
  status: TaskStatus;
  agent_id: string | null;
  assistant_id: string | null;
  team_id: string | null;
  workspace: string | null;
  result: string | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
};

/** Rows already come back snake_case, matching the `Task` contract exactly. */
function toTask(row: TaskRow): Task {
  return row;
}

/** Create the `tasks` table and its status index when missing. Idempotent. */
export function ensureTaskSchema(db: TaskDatabase): void {
  // Required for the WebUI to read and write this file while the app is running.
  db.pragma('journal_mode = WAL');
  db.exec(
    `CREATE TABLE IF NOT EXISTS tasks (
       id TEXT PRIMARY KEY,
       mission TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       agent_id TEXT,
       assistant_id TEXT,
       team_id TEXT,
       workspace TEXT,
       result TEXT,
       error TEXT,
       created_at INTEGER NOT NULL,
       started_at INTEGER,
       completed_at INTEGER,
       updated_at INTEGER NOT NULL
     )`
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status, created_at)');
  // Migration for databases created before `team_id` existed.
  const columns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'team_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN team_id TEXT');
  }
}

export function createTask(db: TaskDatabase, input: CreateTaskInput): Task {
  const now = Date.now();
  const task: Task = {
    id: `task-${now}-${randomBytes(4).toString('hex')}`,
    mission: input.mission,
    status: 'pending',
    agent_id: null,
    assistant_id: input.assistant_id ?? null,
    team_id: input.team_id ?? null,
    workspace: input.workspace ?? null,
    created_at: now,
    started_at: null,
    completed_at: null,
    result: null,
    error: null,
  };

  db.prepare(
    `INSERT INTO tasks
       (id, mission, status, agent_id, assistant_id, team_id, workspace, result, error, created_at, started_at, completed_at, updated_at)
     VALUES
       (@id, @mission, @status, @agent_id, @assistant_id, @team_id, @workspace, @result, @error, @created_at, @started_at, @completed_at, @updated_at)`
  ).run({ ...task, updated_at: now });

  return task;
}

export function getTask(db: TaskDatabase, id: string): Task | null {
  const row = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

export function listTasks(db: TaskDatabase, options: ListTasksOptions = {}): Task[] {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const offset = Math.max(0, options.offset ?? 0);
  const rows = options.status
    ? db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(options.status, limit, offset)
    : db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  return (rows as TaskRow[]).map(toTask);
}

/**
 * Atomically claim the oldest pending task, flipping it to `running`.
 * Returns `null` when nothing is waiting. The transaction keeps two
 * concurrent polls from dispatching the same task twice.
 */
export function claimNextPendingTask(db: TaskDatabase): Task | null {
  const claim = db.transaction((): Task | null => {
    const row = db
      .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`)
      .get() as TaskRow | undefined;
    if (!row) return null;

    const now = Date.now();
    db.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE id = ?').run(
      'running',
      now,
      now,
      row.id
    );
    return { ...row, status: 'running', started_at: now };
  });

  return claim();
}

/** Record the aioncore conversation id once dispatch succeeded. */
export function setTaskConversation(db: TaskDatabase, id: string, conversationId: string): void {
  db.prepare('UPDATE tasks SET agent_id = ?, updated_at = ? WHERE id = ?').run(conversationId, Date.now(), id);
}

export function markTaskCompleted(db: TaskDatabase, id: string, result: string | null): void {
  const now = Date.now();
  db.prepare(
    'UPDATE tasks SET status = ?, result = ?, error = NULL, completed_at = ?, updated_at = ? WHERE id = ?'
  ).run('completed', result, now, now, id);
}

export function markTaskFailed(db: TaskDatabase, id: string, error: string): void {
  const now = Date.now();
  db.prepare('UPDATE tasks SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
    'failed',
    error,
    now,
    now,
    id
  );
}

export function markTaskCancelled(db: TaskDatabase, id: string, error: string | null): void {
  const now = Date.now();
  db.prepare('UPDATE tasks SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
    'cancelled',
    error,
    now,
    now,
    id
  );
}

export function deleteTask(db: TaskDatabase, id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}
