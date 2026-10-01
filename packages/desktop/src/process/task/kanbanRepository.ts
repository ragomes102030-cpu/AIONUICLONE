/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * SQLite repository for the activity Kanban. It shares the task database but
 * keeps board metadata separate from execution status: a card can be moved or
 * edited without mutating the task runner's state machine.
 */

import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createTask, getTask } from './taskRepository';
import {
  KANBAN_DEFAULT_COLUMNS,
  type CreateKanbanBoardInput,
  type CreateKanbanCardInput,
  type CreateKanbanColumnInput,
  type CreateKanbanRoleInput,
  type DeleteKanbanBoardResult,
  type DispatchKanbanCardInput,
  type DispatchKanbanCardResult,
  type KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
  type KanbanListOptions,
  type KanbanPriority,
  type KanbanReasonCode,
  type KanbanRole,
  type MoveKanbanCardInput,
  type UpdateKanbanBoardInput,
  type UpdateKanbanCardInput,
  type UpdateKanbanColumnInput,
  type UpdateKanbanRoleInput,
} from '@/common/kanban/kanbanTypes';

export type KanbanDatabase = Database.Database;

type BoardRow = {
  id: string;
  name: string;
  description: string;
  archived: number;
  manager_role_id: string | null;
  manager_instructions: string;
  created_at: number;
  updated_at: number;
};

type ColumnRow = {
  id: string;
  board_id: string;
  key: string;
  name: string;
  position: number;
  color: string;
  system: number;
};

type RoleRow = {
  id: string;
  board_id: string;
  name: string;
  assistant_id: string | null;
  team_id: string | null;
  responsibility: string;
  color: string;
  position: number;
  created_at: number;
  updated_at: number;
};

type CardRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: KanbanPriority;
  role_id: string | null;
  assignee: string | null;
  task_id: string | null;
  workspace: string | null;
  position: number;
  archived: number;
  scheduled_for: number | null;
  start_for: number | null;
  started_at: number | null;
  finished_at: number | null;
  reason_code: string | null;
  not_done_reason: string | null;
  blocked_reason: string | null;
  blocked_since: number | null;
  created_at: number;
  updated_at: number;
};

const BOARD_COLUMNS = 'id, name, description, archived, manager_role_id, manager_instructions, created_at, updated_at';
const COLUMN_COLUMNS = 'id, board_id, key, name, position, color, system';
const ROLE_COLUMNS =
  'id, board_id, name, assistant_id, team_id, responsibility, color, position, created_at, updated_at';
const CARD_COLUMNS =
  'id, board_id, column_id, title, description, priority, role_id, assignee, task_id, workspace, position, archived, scheduled_for, start_for, started_at, finished_at, reason_code, not_done_reason, blocked_reason, blocked_since, created_at, updated_at';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function now(): number {
  return Date.now();
}

function toColumn(row: ColumnRow): KanbanColumn {
  return {
    id: row.id,
    board_id: row.board_id,
    key: row.key,
    name: row.name,
    position: row.position,
    color: row.color,
    system: row.system === 1,
  };
}

function toRole(row: RoleRow): KanbanRole {
  return {
    id: row.id,
    board_id: row.board_id,
    name: row.name,
    assistant_id: row.assistant_id,
    team_id: row.team_id,
    responsibility: row.responsibility,
    color: row.color,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toCard(row: CardRow): KanbanCard {
  return {
    id: row.id,
    board_id: row.board_id,
    column_id: row.column_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    role_id: row.role_id,
    assignee: row.assignee,
    task_id: row.task_id,
    workspace: row.workspace,
    position: row.position,
    archived: row.archived === 1,
    scheduled_for: row.scheduled_for,
    start_for: row.start_for,
    started_at: row.started_at,
    finished_at: row.finished_at,
    reason_code: row.reason_code as KanbanReasonCode | null,
    not_done_reason: row.not_done_reason,
    blocked_reason: row.blocked_reason as KanbanReasonCode | null,
    blocked_since: row.blocked_since,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getBoardRow(db: KanbanDatabase, id: string): BoardRow | null {
  return (
    (db.prepare(`SELECT ${BOARD_COLUMNS} FROM kanban_boards WHERE id = ?`).get(id) as BoardRow | undefined) ?? null
  );
}

function getColumnRow(db: KanbanDatabase, id: string): ColumnRow | null {
  return (
    (db.prepare(`SELECT ${COLUMN_COLUMNS} FROM kanban_columns WHERE id = ?`).get(id) as ColumnRow | undefined) ?? null
  );
}

function getRoleRow(db: KanbanDatabase, id: string): RoleRow | null {
  return (db.prepare(`SELECT ${ROLE_COLUMNS} FROM kanban_roles WHERE id = ?`).get(id) as RoleRow | undefined) ?? null;
}

function getCardRow(db: KanbanDatabase, id: string): CardRow | null {
  return (db.prepare(`SELECT ${CARD_COLUMNS} FROM kanban_cards WHERE id = ?`).get(id) as CardRow | undefined) ?? null;
}

function readBoard(db: KanbanDatabase, id: string): KanbanBoard | null {
  const board = getBoardRow(db, id);
  if (!board) return null;
  const columns = db
    .prepare(`SELECT ${COLUMN_COLUMNS} FROM kanban_columns WHERE board_id = ? ORDER BY position ASC, id ASC`)
    .all(id) as ColumnRow[];
  const roles = db
    .prepare(`SELECT ${ROLE_COLUMNS} FROM kanban_roles WHERE board_id = ? ORDER BY position ASC, id ASC`)
    .all(id) as RoleRow[];
  const cards = db
    .prepare(`SELECT ${CARD_COLUMNS} FROM kanban_cards WHERE board_id = ? ORDER BY position ASC, id ASC`)
    .all(id) as CardRow[];
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    archived: board.archived === 1,
    manager_role_id: board.manager_role_id,
    manager_instructions: board.manager_instructions,
    columns: columns.map(toColumn),
    roles: roles.map(toRole),
    cards: cards.map((row) => ({ ...toCard(row), depends_on: readCardDependencies(db, row.id) })),
    created_at: board.created_at,
    updated_at: board.updated_at,
  };
}

function insertBoard(db: KanbanDatabase, name: string, description: string): string {
  const timestamp = now();
  const id = newId('board');
  db.prepare(
    `INSERT INTO kanban_boards (id, name, description, archived, manager_role_id, manager_instructions, created_at, updated_at)
     VALUES (?, ?, ?, 0, NULL, '', ?, ?)`
  ).run(id, name, description, timestamp, timestamp);
  const insertColumn = db.prepare(
    `INSERT INTO kanban_columns (id, board_id, key, name, position, color, system)
     VALUES (?, ?, ?, '', ?, ?, 1)`
  );
  KANBAN_DEFAULT_COLUMNS.forEach((column, position) => {
    insertColumn.run(newId('column'), id, column.key, position, column.color);
  });
  return id;
}

/** Create the Kanban tables and indexes. Safe to call on every app start. */
export function ensureKanbanSchema(db: KanbanDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanban_boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      manager_role_id TEXT,
      manager_instructions TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kanban_columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      color TEXT NOT NULL,
      system INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS kanban_roles (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      assistant_id TEXT,
      team_id TEXT,
      responsibility TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS kanban_cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'P2',
      role_id TEXT,
      task_id TEXT,
      workspace TEXT,
      position INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      assignee TEXT,
      scheduled_for INTEGER,
      start_for INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      reason_code TEXT,
      not_done_reason TEXT,
      blocked_reason TEXT,
      blocked_since INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE,
      FOREIGN KEY(column_id) REFERENCES kanban_columns(id),
      FOREIGN KEY(role_id) REFERENCES kanban_roles(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS kanban_card_dependencies (
      card_id TEXT NOT NULL,
      depends_on_id TEXT NOT NULL,
      PRIMARY KEY (card_id, depends_on_id),
      FOREIGN KEY(card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
      FOREIGN KEY(depends_on_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_kanban_roles_board ON kanban_roles(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id, position);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_task ON kanban_cards(task_id);
  `);
  const boardColumns = db.prepare('PRAGMA table_info(kanban_boards)').all() as Array<{ name: string }>;
  if (!boardColumns.some((column) => column.name === 'manager_role_id')) {
    db.exec('ALTER TABLE kanban_boards ADD COLUMN manager_role_id TEXT');
  }
  if (!boardColumns.some((column) => column.name === 'manager_instructions')) {
    db.exec("ALTER TABLE kanban_boards ADD COLUMN manager_instructions TEXT NOT NULL DEFAULT ''");
  }
  const cardColumns = db.prepare('PRAGMA table_info(kanban_cards)').all() as Array<{ name: string }>;
  const cardAdditions: Array<[string, string]> = [
    ['assignee', 'ALTER TABLE kanban_cards ADD COLUMN assignee TEXT'],
    ['scheduled_for', 'ALTER TABLE kanban_cards ADD COLUMN scheduled_for INTEGER'],
    ['started_at', 'ALTER TABLE kanban_cards ADD COLUMN started_at INTEGER'],
    ['finished_at', 'ALTER TABLE kanban_cards ADD COLUMN finished_at INTEGER'],
    ['reason_code', 'ALTER TABLE kanban_cards ADD COLUMN reason_code TEXT'],
    ['not_done_reason', 'ALTER TABLE kanban_cards ADD COLUMN not_done_reason TEXT'],
    ['start_for', 'ALTER TABLE kanban_cards ADD COLUMN start_for INTEGER'],
    ['blocked_reason', 'ALTER TABLE kanban_cards ADD COLUMN blocked_reason TEXT'],
    ['blocked_since', 'ALTER TABLE kanban_cards ADD COLUMN blocked_since INTEGER'],
  ];
  for (const [name, statement] of cardAdditions) {
    if (!cardColumns.some((column) => column.name === name)) db.exec(statement);
  }
  // After the ALTERs: on a database created before these columns existed, an
  // index over them cannot be created inside the block above.
  db.exec('CREATE INDEX IF NOT EXISTS idx_kanban_cards_assignee ON kanban_cards(assignee)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_kanban_cards_reason ON kanban_cards(reason_code)');
}

function ensureDefaultBoard(db: KanbanDatabase): void {
  const row = db.prepare('SELECT id FROM kanban_boards ORDER BY created_at ASC LIMIT 1').get() as
    | { id: string }
    | undefined;
  if (row) return;
  const create = db.transaction(() => insertBoard(db, 'Kanban', ''));
  create();
}

export function setKanbanCardDependencies(db: KanbanDatabase, cardId: string, dependsOn: string[]): void {
  ensureKanbanSchema(db);
  const clear = db.prepare('DELETE FROM kanban_card_dependencies WHERE card_id = ?');
  const add = db.prepare('INSERT OR IGNORE INTO kanban_card_dependencies (card_id, depends_on_id) VALUES (?, ?)');
  const replace = db.transaction(() => {
    clear.run(cardId);
    for (const dependencyId of dependsOn) {
      if (dependencyId === cardId) continue;
      if (!getCardRow(db, dependencyId)) throw new Error(`Kanban dependency not found: ${dependencyId}`);
      add.run(cardId, dependencyId);
    }
  });
  replace();
}

function readCardDependencies(db: KanbanDatabase, cardId: string): string[] {
  return (
    db
      .prepare('SELECT depends_on_id FROM kanban_card_dependencies WHERE card_id = ? ORDER BY depends_on_id')
      .all(cardId) as Array<{
      depends_on_id: string;
    }>
  ).map((row) => row.depends_on_id);
}

export function listKanbanBoards(db: KanbanDatabase, options: KanbanListOptions = {}): KanbanBoard[] {
  ensureKanbanSchema(db);
  ensureDefaultBoard(db);
  const rows = db
    .prepare(
      `SELECT ${BOARD_COLUMNS} FROM kanban_boards
       ${options.include_archived ? '' : 'WHERE archived = 0'}
       ORDER BY created_at ASC`
    )
    .all() as BoardRow[];
  return rows.map((row) => readBoard(db, row.id)).filter((board): board is KanbanBoard => board !== null);
}

export function createKanbanBoard(db: KanbanDatabase, input: CreateKanbanBoardInput): KanbanBoard {
  ensureKanbanSchema(db);
  const name = input.name.trim();
  if (!name) throw new Error('Kanban board name must not be empty');
  const id = db.transaction(() => insertBoard(db, name, input.description?.trim() ?? ''))();
  const board = readBoard(db, id);
  if (!board) throw new Error('Kanban board could not be read after creation');
  return board;
}

export function updateKanbanBoard(db: KanbanDatabase, input: UpdateKanbanBoardInput): KanbanBoard {
  ensureKanbanSchema(db);
  const current = getBoardRow(db, input.id);
  if (!current) throw new Error('Kanban board not found');
  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new Error('Kanban board name must not be empty');
  const description = input.description === undefined ? current.description : input.description.trim();
  const archived = input.archived === undefined ? current.archived : input.archived ? 1 : 0;
  const managerRoleId = input.manager_role_id === undefined ? current.manager_role_id : input.manager_role_id;
  if (managerRoleId) {
    const managerRole = getRoleRow(db, managerRoleId);
    if (!managerRole || managerRole.board_id !== input.id)
      throw new Error('Kanban manager role not found on this board');
  }
  const managerInstructions =
    input.manager_instructions === undefined ? current.manager_instructions : input.manager_instructions.trim();
  db.prepare(
    `UPDATE kanban_boards
     SET name = ?, description = ?, archived = ?, manager_role_id = ?, manager_instructions = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, description, archived, managerRoleId, managerInstructions, now(), input.id);
  const board = readBoard(db, input.id);
  if (!board) throw new Error('Kanban board not found after update');
  return board;
}

export function deleteKanbanBoard(db: KanbanDatabase, id: string): DeleteKanbanBoardResult {
  ensureKanbanSchema(db);
  if (!getBoardRow(db, id)) return { deleted: false, cards: 0, roles: 0, columns: 0 };
  const count = (table: 'kanban_cards' | 'kanban_roles' | 'kanban_columns'): number =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE board_id = ?`).get(id) as { count: number }).count;
  const result = { cards: count('kanban_cards'), roles: count('kanban_roles'), columns: count('kanban_columns') };
  const remove = db.transaction(() => {
    // Task rows are intentionally preserved: deleting a board removes its
    // planning metadata, not the audit/history of work already executed.
    db.prepare('DELETE FROM kanban_cards WHERE board_id = ?').run(id);
    db.prepare('DELETE FROM kanban_roles WHERE board_id = ?').run(id);
    db.prepare('DELETE FROM kanban_columns WHERE board_id = ?').run(id);
    db.prepare('DELETE FROM kanban_boards WHERE id = ?').run(id);
  });
  remove();
  return { deleted: true, ...result };
}

export function createKanbanRole(db: KanbanDatabase, input: CreateKanbanRoleInput): KanbanRole {
  ensureKanbanSchema(db);
  if (!getBoardRow(db, input.board_id)) throw new Error('Kanban board not found');
  const name = input.name.trim();
  if (!name) throw new Error('Kanban role name must not be empty');
  const timestamp = now();
  const id = newId('role');
  const position = (
    db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM kanban_roles WHERE board_id = ?')
      .get(input.board_id) as {
      next_position: number;
    }
  ).next_position;
  db.prepare(
    `INSERT INTO kanban_roles
       (id, board_id, name, assistant_id, team_id, responsibility, color, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.board_id,
    name,
    input.assistant_id ?? null,
    input.team_id ?? null,
    input.responsibility?.trim() ?? '',
    input.color?.trim() || '#3b82f6',
    position,
    timestamp,
    timestamp
  );
  const role = getRoleRow(db, id);
  if (!role) throw new Error('Kanban role could not be read after creation');
  return toRole(role);
}

export function updateKanbanRole(db: KanbanDatabase, input: UpdateKanbanRoleInput): KanbanRole {
  ensureKanbanSchema(db);
  const current = getRoleRow(db, input.id);
  if (!current) throw new Error('Kanban role not found');
  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new Error('Kanban role name must not be empty');
  db.prepare(
    `UPDATE kanban_roles
     SET name = ?, assistant_id = ?, team_id = ?, responsibility = ?, color = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    input.assistant_id === undefined ? current.assistant_id : input.assistant_id,
    input.team_id === undefined ? current.team_id : input.team_id,
    input.responsibility === undefined ? current.responsibility : input.responsibility.trim(),
    input.color === undefined ? current.color : input.color.trim() || current.color,
    now(),
    input.id
  );
  const role = getRoleRow(db, input.id);
  if (!role) throw new Error('Kanban role not found after update');
  return toRole(role);
}

export function deleteKanbanRole(db: KanbanDatabase, id: string): boolean {
  ensureKanbanSchema(db);
  const role = getRoleRow(db, id);
  if (!role) return false;
  const remove = db.transaction(() => {
    db.prepare('UPDATE kanban_cards SET role_id = NULL, updated_at = ? WHERE role_id = ?').run(now(), id);
    db.prepare('DELETE FROM kanban_roles WHERE id = ?').run(id);
  });
  remove();
  return true;
}

export function createKanbanCard(db: KanbanDatabase, input: CreateKanbanCardInput): KanbanCard {
  ensureKanbanSchema(db);
  if (!getBoardRow(db, input.board_id)) throw new Error('Kanban board not found');
  const column = getColumnRow(db, input.column_id);
  if (!column || column.board_id !== input.board_id) throw new Error('Kanban column not found on this board');
  const title = input.title.trim();
  if (!title) throw new Error('Kanban card title must not be empty');
  const timestamp = now();
  const id = newId('card');
  const position = (
    db
      .prepare(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM kanban_cards WHERE column_id = ? AND archived = 0'
      )
      .get(input.column_id) as { next_position: number }
  ).next_position;
  db.prepare(
    `INSERT INTO kanban_cards
       (id, board_id, column_id, title, description, priority, role_id, assignee, task_id, workspace, position, archived, scheduled_for, start_for, started_at, finished_at, reason_code, not_done_reason, blocked_reason, blocked_since, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
  ).run(
    id,
    input.board_id,
    input.column_id,
    title,
    input.description?.trim() ?? '',
    input.priority ?? 'P2',
    input.role_id ?? null,
    input.assignee?.trim() || null,
    input.workspace?.trim() || null,
    position,
    input.scheduled_for ?? null,
    input.start_for ?? null,
    input.blocked_reason ?? null,
    input.blocked_since ?? null,
    timestamp,
    timestamp
  );
  const card = getCardRow(db, id);
  if (!card) throw new Error('Kanban card could not be read after creation');
  return toCard(card);
}

export function updateKanbanCard(db: KanbanDatabase, input: UpdateKanbanCardInput): KanbanCard {
  ensureKanbanSchema(db);
  const current = getCardRow(db, input.id);
  if (!current) throw new Error('Kanban card not found');
  const columnId = input.column_id ?? current.column_id;
  const column = getColumnRow(db, columnId);
  if (!column || column.board_id !== current.board_id) throw new Error('Kanban column not found on this board');
  const title = input.title === undefined ? current.title : input.title.trim();
  if (!title) throw new Error('Kanban card title must not be empty');
  db.prepare(
    `UPDATE kanban_cards
     SET title = ?, description = ?, priority = ?, role_id = ?, column_id = ?, task_id = ?, workspace = ?, archived = ?,
         assignee = ?, scheduled_for = ?, start_for = ?, started_at = ?, finished_at = ?, reason_code = ?, not_done_reason = ?,
         blocked_reason = ?, blocked_since = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    input.description === undefined ? current.description : input.description.trim(),
    input.priority ?? current.priority,
    input.role_id === undefined ? current.role_id : input.role_id,
    columnId,
    input.task_id === undefined ? current.task_id : input.task_id,
    input.workspace === undefined ? current.workspace : input.workspace?.trim() || null,
    input.archived === undefined ? current.archived : input.archived ? 1 : 0,
    input.assignee === undefined ? current.assignee : input.assignee?.trim() || null,
    input.scheduled_for === undefined ? current.scheduled_for : input.scheduled_for,
    input.start_for === undefined ? current.start_for : input.start_for,
    input.started_at === undefined ? current.started_at : input.started_at,
    input.finished_at === undefined ? current.finished_at : input.finished_at,
    input.reason_code === undefined ? current.reason_code : input.reason_code,
    input.not_done_reason === undefined ? current.not_done_reason : input.not_done_reason?.trim() || null,
    input.blocked_reason === undefined ? current.blocked_reason : input.blocked_reason,
    input.blocked_since === undefined ? current.blocked_since : input.blocked_since,
    now(),
    input.id
  );
  const card = getCardRow(db, input.id);
  if (!card) throw new Error('Kanban card not found after update');
  return toCard(card);
}

function writeOrderedCards(db: KanbanDatabase, cards: CardRow[]): void {
  const update = db.prepare('UPDATE kanban_cards SET position = ?, column_id = ?, updated_at = ? WHERE id = ?');
  cards.forEach((card, position) => update.run(position, card.column_id, now(), card.id));
}

export function moveKanbanCard(db: KanbanDatabase, input: MoveKanbanCardInput): KanbanCard {
  ensureKanbanSchema(db);
  const current = getCardRow(db, input.id);
  if (!current) throw new Error('Kanban card not found');
  const targetColumn = getColumnRow(db, input.column_id);
  if (!targetColumn || targetColumn.board_id !== current.board_id) {
    throw new Error('Kanban column not found on this board');
  }

  const move = db.transaction(() => {
    const oldRows = db
      .prepare(
        `SELECT ${CARD_COLUMNS} FROM kanban_cards
         WHERE column_id = ? AND id != ? AND archived = 0 ORDER BY position ASC, id ASC`
      )
      .all(current.column_id, current.id) as CardRow[];
    const targetRows =
      current.column_id === input.column_id
        ? oldRows
        : (db
            .prepare(
              `SELECT ${CARD_COLUMNS} FROM kanban_cards
               WHERE column_id = ? AND id != ? AND archived = 0 ORDER BY position ASC, id ASC`
            )
            .all(input.column_id, current.id) as CardRow[]);
    const requested = input.position ?? targetRows.length;
    const index = Math.max(0, Math.min(requested, targetRows.length));
    targetRows.splice(index, 0, { ...current, column_id: input.column_id });
    if (current.column_id !== input.column_id) writeOrderedCards(db, oldRows);
    writeOrderedCards(db, targetRows);
  });
  move();
  const card = getCardRow(db, input.id);
  if (!card) throw new Error('Kanban card not found after move');
  return toCard(card);
}

function workspaceSegment(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'sem-titulo';
}

/** One folder per card, so finished cards keep their output as a record of past work. */
function cardWorkspacePath(root: string, boardName: string, cardId: string, cardTitle: string): string {
  const title = workspaceSegment(cardTitle).slice(0, 48);
  return join(root, workspaceSegment(boardName), title, cardId);
}

export function dispatchKanbanCard(db: KanbanDatabase, input: DispatchKanbanCardInput): DispatchKanbanCardResult {
  ensureKanbanSchema(db);
  const current = getCardRow(db, input.card_id);
  if (!current) throw new Error('Kanban card not found');
  const mission = input.mission.trim();
  if (!mission) throw new Error('Kanban dispatch mission must not be empty');
  const columnId = input.column_id ?? current.column_id;
  const column = getColumnRow(db, columnId);
  if (!column || column.board_id !== current.board_id) throw new Error('Kanban column not found on this board');

  const result = db.transaction(() => {
    // Re-read inside the transaction so two renderer clicks cannot both create
    // a task for the same card.
    const fresh = getCardRow(db, current.id);
    if (!fresh) throw new Error('Kanban card not found');
    if (fresh.task_id) {
      const existing = getTask(db, fresh.task_id);
      if (existing) return { task: existing, reused: true };
    }
    const board = getBoardRow(db, fresh.board_id);
    const workspace =
      input.workspace ??
      fresh.workspace ??
      (input.workspace_root && board
        ? cardWorkspacePath(input.workspace_root, board.name, fresh.id, fresh.title)
        : null);
    const task = createTask(db, {
      mission,
      assistant_id: input.assistant_id ?? null,
      team_id: input.team_id ?? null,
      workspace,
    });
    db.prepare('UPDATE kanban_cards SET task_id = ?, column_id = ?, workspace = ?, updated_at = ? WHERE id = ?').run(
      task.id,
      columnId,
      workspace,
      now(),
      fresh.id
    );
    return { task, reused: false };
  })();
  const card = getCardRow(db, current.id);
  if (!card) throw new Error('Kanban card not found after dispatch');
  return { card: toCard(card), task: result.task, reused: result.reused };
}

export function createKanbanColumn(db: KanbanDatabase, input: CreateKanbanColumnInput): KanbanColumn {
  ensureKanbanSchema(db);
  if (!getBoardRow(db, input.board_id)) throw new Error('Kanban board not found');
  const name = input.name.trim();
  if (!name) throw new Error('Kanban column name must not be empty');
  const id = newId('column');
  const position = (
    db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM kanban_columns WHERE board_id = ?')
      .get(input.board_id) as {
      next_position: number;
    }
  ).next_position;
  db.prepare(
    `INSERT INTO kanban_columns (id, board_id, key, name, position, color, system)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(id, input.board_id, `custom-${id}`, name, position, input.color?.trim() || '#64748b');
  const column = getColumnRow(db, id);
  if (!column) throw new Error('Kanban column could not be read after creation');
  return toColumn(column);
}

export function updateKanbanColumn(db: KanbanDatabase, input: UpdateKanbanColumnInput): KanbanColumn {
  ensureKanbanSchema(db);
  const current = getColumnRow(db, input.id);
  if (!current) throw new Error('Kanban column not found');
  const name = input.name === undefined ? current.name : input.name.trim();
  if (current.system && !name) throw new Error('Built-in Kanban columns cannot be emptied');
  db.prepare('UPDATE kanban_columns SET name = ?, color = ? WHERE id = ?').run(
    name,
    input.color === undefined ? current.color : input.color.trim() || current.color,
    input.id
  );
  const column = getColumnRow(db, input.id);
  if (!column) throw new Error('Kanban column not found after update');
  return toColumn(column);
}

export function deleteKanbanColumn(db: KanbanDatabase, id: string): boolean {
  ensureKanbanSchema(db);
  const column = getColumnRow(db, id);
  if (!column || column.system) return false;
  const count = db.prepare('SELECT COUNT(*) AS count FROM kanban_cards WHERE column_id = ?').get(id) as {
    count: number;
  };
  if (count.count > 0) throw new Error('Move or archive the cards before deleting this column');
  db.prepare('DELETE FROM kanban_columns WHERE id = ?').run(id);
  return true;
}
