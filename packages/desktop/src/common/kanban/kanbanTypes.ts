/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared contracts for the activity Kanban. The board is an allocation layer
 * above existing assistants/tasks; it does not create a new agent runtime.
 */

import type { Task } from '@/common/task/taskTypes';

export type KanbanPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type KanbanColumn = {
  id: string;
  board_id: string;
  /** Stable key for built-in columns; custom columns use a generated key. */
  key: string;
  /** Empty for built-in columns whose label is resolved through i18n. */
  name: string;
  position: number;
  color: string;
  system: boolean;
};

export type KanbanRole = {
  id: string;
  board_id: string;
  /** Board-local label; the underlying assistant is not renamed globally. */
  name: string;
  assistant_id: string | null;
  team_id: string | null;
  responsibility: string;
  color: string;
  position: number;
  created_at: number;
  updated_at: number;
};

/**
 * How long a service has been standing still.
 *
 * Returns null when nothing is blocking it. The day count is what turns a
 * "blocked" column into a queue you can sort: two days is a phone call, three
 * weeks is an escalation to whoever buys the material.
 */
export function blockedAgeDays(card: Pick<KanbanCard, 'blocked_since'>, now: number): number | null {
  if (card.blocked_since === null) return null;
  return Math.max(0, Math.floor((now - card.blocked_since) / DAY_MS));
}

/** Week windows offered in the board. Three is the common one in lean planning. */
export const KANBAN_LOOKAHEAD_WEEKS: readonly number[] = [1, 2, 3, 4, 6];

/**
 * The date a service belongs to on a calendar: when it is meant to start, or
 * failing that when it is due. A service with neither cannot be placed in a time
 * window, so it stays out of the lookahead instead of polluting it.
 */
export function lookaheadAnchor(card: Pick<KanbanCard, 'start_for' | 'scheduled_for'>): number | null {
  return card.start_for ?? card.scheduled_for;
}

/**
 * Whether a service belongs in the weekly lookahead.
 *
 * The window is measured forward from now, but it deliberately also admits
 * anything already past its date: an overdue service is the first item of every
 * planning conversation, and a lookahead that hid them would be exactly the
 * reassuring board that lets a delay rot.
 *
 * Finished and archived services are left out — the meeting is about what is
 * still moving.
 */
export function isWithinLookahead(
  card: Pick<KanbanCard, 'archived' | 'finished_at' | 'start_for' | 'scheduled_for'>,
  now: number,
  weeks: number
): boolean {
  if (card.archived) return false;
  if (card.finished_at !== null) return false;
  const anchor = lookaheadAnchor(card);
  if (anchor === null) return false;
  return anchor <= now + weeks * 7 * DAY_MS;
}

/** The cards the weekly meeting is about, in the order the board already has. */
export function filterByLookahead<T extends Pick<KanbanCard, 'archived' | 'finished_at' | 'start_for' | 'scheduled_for'>>(
  cards: readonly T[],
  now: number,
  weeks: number
): T[] {
  return cards.filter((card) => isWithinLookahead(card, now, weeks));
}

/**
 * Why a service did not finish. A closed vocabulary is what lets the board say
 * "your delays are 70% material" — free text cannot be counted.
 */
export type KanbanReasonCode =
  | 'material'
  | 'mao_de_obra'
  | 'clima'
  | 'impedimento_anterior'
  | 'bloqueio_frente'
  | 'ferramenta'
  | 'outro';

export const KANBAN_REASON_CODES: readonly KanbanReasonCode[] = [
  'material',
  'mao_de_obra',
  'clima',
  'impedimento_anterior',
  'bloqueio_frente',
  'ferramenta',
  'outro',
];

export type KanbanCard = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: KanbanPriority;
  role_id: string | null;
  /**
   * Who is on site. Deliberately separate from `role_id`, which points at an AI
   * assistant: a service is executed by a crew, and the crew is who the delay
   * belongs to.
   */
  assignee: string | null;
  task_id: string | null;
  workspace: string | null;
  position: number;
  archived: boolean;
  /**
   * When the service was committed to start, epoch ms. The field crew works
   * from this: the request is issued for a day, not for a week.
   */
  scheduled_for: number | null;
  /**
   * When the service is planned to START, epoch ms.
   *
   * One date is not enough to plan a service: "vence sexta" says nothing about
   * whether the crew is on site Monday or Thursday, and a service that started
   * late looks identical to one that started on time but ran over. With a planned
   * start the board can tell "começou atrasado" from "começou e estourou", which
   * is the difference between chasing the crew and chasing the predecessor.
   *
   * Optional on purpose: a board that only ever tracked a deadline keeps working.
   */
  start_for: number | null;
  started_at: number | null;
  finished_at: number | null;
  reason_code: KanbanReasonCode | null;
  /** Why the service was not finished, per the receipt handed back from site. */
  not_done_reason: string | null;
  /**
   * What is stopping this service RIGHT NOW, epoch-free vocabulary shared with
   * `reason_code` so the board speaks one language: material, mão de obra,
   * clima, impedimento anterior, bloqueio de frente, ferramenta, outro.
   *
   * `reason_code` answers "why did it not finish" (after the fact). This answers
   * "why is it not moving" (right now). They are different questions, and a
   * service can be both blocked now and closed late later.
   */
  blocked_reason: KanbanReasonCode | null;
  /**
   * When the current impediment appeared, epoch ms. Paired with
   * `blocked_reason` this is the single most useful number in the board: a block
   * that lasted two days is a conversation, one that lasted three weeks is an
   * escalation. Duration is what makes an impediment actionable instead of just
   * recorded.
   */
  blocked_since: number | null;
  created_at: number;
  updated_at: number;
};

/** A card, plus the ids of the cards that must finish before it can start. */
export type KanbanCardWithDeps = KanbanCard & { depends_on: string[] };

/**
 * How many hours of warning a service gets before its clock runs out. This is
 * the single knob for "due soon": the decision to chase someone is made the day
 * before, not after the deadline has already passed.
 */
export const KANBAN_DUE_SOON_HOURS = 24;

/** Days the site works, as `Date.getDay()` values: 0 is Sunday, 6 is Saturday. */
export const KANBAN_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Fixed non-working dates (YYYY-MM-DD) for holidays that repeat every year. */
export const KANBAN_HOLIDAYS: readonly string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isWorkingDay(
  timestamp: number,
  workingDays: readonly number[] = KANBAN_WORKING_DAYS,
  holidays: readonly string[] = KANBAN_HOLIDAYS
): boolean {
  if (holidays.includes(new Date(timestamp).toISOString().slice(0, 10))) return false;
  return workingDays.includes(new Date(timestamp).getDay());
}

/**
 * When a service really has to be finished, given a commitment that may fall on
 * a rest day. Work committed to Saturday on a site closed on Saturday was never
 * going to happen, so the clock is pulled back to the last working day rather
 * than let it run into a weekend nobody was ever going to work.
 */
export function effectiveDeadline(
  scheduledFor: number,
  workingDays: readonly number[] = KANBAN_WORKING_DAYS,
  holidays: readonly string[] = KANBAN_HOLIDAYS
): number {
  let cursor = scheduledFor;
  for (let guard = 0; guard < 14; guard += 1) {
    if (isWorkingDay(cursor, workingDays, holidays)) return cursor;
    cursor -= DAY_MS;
  }
  return scheduledFor;
}

/**
 * Whether a service is tracking to its commitment.
 *
 * `overdue` means the clock passed `scheduled_for` and nobody recorded a start.
 * It is derived on read and never stored: a stored "late" flag becomes a lie
 * the moment someone corrects the schedule, and correcting the schedule must
 * not erase the fact that the service was late.
 */
export type KanbanScheduleStatus =
  | 'not_started'
  | 'scheduled'
  | 'due_soon'
  | 'overdue'
  | 'in_progress'
  | 'late_finish'
  | 'done'
  | 'archived';

/** Starting late and finishing late need different remedies, so they are not one status. */
export const KANBAN_ARCHIVE_COLUMN_KEY = 'finalizados';

export function deriveScheduleStatus(
  card: Pick<KanbanCard, 'column_id' | 'scheduled_for' | 'started_at' | 'finished_at'>,
  columns: ReadonlyArray<Pick<KanbanColumn, 'id' | 'key'>>,
  now: number,
  dueSoonHours: number = KANBAN_DUE_SOON_HOURS,
  workingDays: readonly number[] = KANBAN_WORKING_DAYS,
  holidays: readonly string[] = KANBAN_HOLIDAYS
): KanbanScheduleStatus {
  const column = columns.find((item) => item.id === card.column_id);
  const deadline = card.scheduled_for === null ? null : effectiveDeadline(card.scheduled_for, workingDays, holidays);
  if (column?.key === KANBAN_ARCHIVE_COLUMN_KEY) return 'archived';
  // Someone parked the card in "blocked" to say it cannot go on. That statement
  // outranks a receipt: a card can hold a finish time from an earlier pass and
  // still be blocked now, and reading it as finished would hide the problem.
  if (column?.key === 'blocked' && card.finished_at !== null) return 'late_finish';
  if (card.finished_at !== null) {
    return deadline !== null && card.finished_at > deadline ? 'late_finish' : 'done';
  }
  if (column?.key === 'done') return 'done';
  // Lateness outranks "in progress".
  //
  // This order used to be the other way round: `started_at` returned
  // in_progress before the deadline was ever compared, so a service that had
  // started and then blown past its date was reported as healthy — forever. On
  // site that is the worst case there is, and it was the quiet one.
  //
  // Nothing is lost by checking the date first: the card carries its own blue
  // "Iniciou dd/mm" tag, so "underway" stays visible without hiding the
  // warning.
  if (deadline !== null && now >= deadline) return 'overdue';
  if (deadline !== null && now >= deadline - dueSoonHours * 60 * 60 * 1000) return 'due_soon';
  if (card.started_at !== null) return 'in_progress';
  if (deadline === null) return 'not_started';
  return 'scheduled';
}

const BLOCKING_COLUMN_KEYS = new Set(['blocked']);

/**
 * A service is at risk when work it waits on is already late, and it has not
 * started itself. This is the same reasoning as the critical path: the delay is
 * not predicted, it is propagated from a predecessor that is known to be down.
 */
export function isCardAtRisk(
  card: Pick<
    KanbanCardWithDeps,
    'column_id' | 'depends_on' | 'scheduled_for' | 'started_at' | 'finished_at' | 'archived'
  >,
  cards: ReadonlyMap<
    string,
    Pick<KanbanCardWithDeps, 'column_id' | 'depends_on' | 'scheduled_for' | 'started_at' | 'finished_at' | 'archived'>
  >,
  columns: ReadonlyArray<Pick<KanbanColumn, 'id' | 'key'>>,
  now: number
): boolean {
  if (card.archived) return false;
  if (card.depends_on.length === 0) return false;
  const own = deriveScheduleStatus(card, columns, now);
  if (own === 'done' || own === 'in_progress') return false;
  return card.depends_on.some((dependencyId) => {
    const dependency = cards.get(dependencyId);
    if (!dependency) return false;
    if (BLOCKING_COLUMN_KEYS.has(columns.find((item) => item.id === dependency.column_id)?.key ?? '')) return true;
    return deriveScheduleStatus(dependency, columns, now) === 'overdue';
  });
}

/**
 * Every service that is waiting on this one to finish, together with how many
 * of its own predecessors are also late. A service with two late predecessors
 * is not twice as urgent as one with a single late predecessor, but it is a
 * different problem: it needs a decision, not a reminder.
 */
export type CardImpact = {
  card_id: string;
  title: string;
  assignee: string | null;
  /** Late predecessors this service is directly waiting on. */
  lateDependencies: string[];
  /** How many services are transitively waiting on this one. */
  blocksCount: number;
};

type SchedulableCard = Pick<
  KanbanCardWithDeps,
  'id' | 'title' | 'assignee' | 'column_id' | 'depends_on' | 'scheduled_for' | 'started_at' | 'finished_at' | 'archived'
>;

/**
 * The services that are actually holding up the board, worst first. This is the
 * list worth reading before deciding anything: it answers "what do I chase
 * today" without anyone having to sort cards by hand.
 */
export function rankByImpact(
  cards: readonly SchedulableCard[],
  columns: ReadonlyArray<Pick<KanbanColumn, 'id' | 'key'>>,
  now: number
): CardImpact[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const dependents = new Map<string, string[]>();
  for (const card of cards) {
    if (card.archived) continue;
    for (const dependencyId of card.depends_on) {
      const list = dependents.get(dependencyId);
      if (list) list.push(card.id);
      else dependents.set(dependencyId, [card.id]);
    }
  }

  // Distinct services reachable downstream, so a service reachable through two
  // paths is counted once. The result depends on the starting node, so it is
  // computed per card rather than memoised globally.
  const reachable = (cardId: string): Set<string> => {
    const found = new Set<string>();
    const queue = [...(dependents.get(cardId) ?? [])];
    while (queue.length > 0) {
      const next = queue.pop()!;
      if (found.has(next) || next === cardId) continue;
      found.add(next);
      queue.push(...(dependents.get(next) ?? []));
    }
    return found;
  };

  const impacts: CardImpact[] = [];
  for (const card of cards) {
    if (card.archived) continue;
    const status = deriveScheduleStatus(card, columns, now);

    // A finished or archived service is history, not a decision. It stays in the
    // board so the record of being late survives, but it never sits in the list
    // of things to chase, and it no longer holds anything up.
    if (status === 'done' || status === 'late_finish' || status === 'archived') continue;

    const isLate = status === 'overdue';
    const blocksCount = reachable(card.id).size;

    const lateDependencies = card.depends_on.filter((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (!dependency) return false;
      const dependencyStatus = deriveScheduleStatus(dependency, columns, now);
      if (dependencyStatus === 'overdue') return true;
      return BLOCKING_COLUMN_KEYS.has(columns.find((item) => item.id === dependency.column_id)?.key ?? '');
    });

    if (!isLate && blocksCount === 0 && lateDependencies.length === 0) continue;

    impacts.push({
      card_id: card.id,
      title: card.title,
      assignee: card.assignee ?? null,
      lateDependencies,
      blocksCount,
    });
  }

  return impacts.sort(
    (a, b) =>
      b.blocksCount - a.blocksCount ||
      b.lateDependencies.length - a.lateDependencies.length ||
      a.title.localeCompare(b.title)
  );
}

export type KanbanBoard = {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  manager_role_id: string | null;
  manager_instructions: string;
  columns: KanbanColumn[];
  roles: KanbanRole[];
  cards: KanbanCardWithDeps[];
  created_at: number;
  updated_at: number;
};

export type KanbanListOptions = {
  include_archived?: boolean;
};

export type CreateKanbanBoardInput = {
  name: string;
  description?: string;
};

export type UpdateKanbanBoardInput = {
  id: string;
  name?: string;
  description?: string;
  archived?: boolean;
  manager_role_id?: string | null;
  manager_instructions?: string;
};

export type CreateKanbanRoleInput = {
  board_id: string;
  name: string;
  assistant_id?: string | null;
  team_id?: string | null;
  responsibility?: string;
  color?: string;
};

export type DeleteKanbanBoardInput = {
  id: string;
};

export type DeleteKanbanBoardResult = {
  deleted: boolean;
  cards: number;
  roles: number;
  columns: number;
};

export type UpdateKanbanRoleInput = Partial<CreateKanbanRoleInput> & {
  id: string;
};

export type DeleteKanbanRoleInput = {
  id: string;
};

export type CreateKanbanCardInput = {
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  priority?: KanbanPriority;
  role_id?: string | null;
  assignee?: string | null;
  workspace?: string | null;
  scheduled_for?: number | null;
  start_for?: number | null;
  blocked_reason?: KanbanReasonCode | null;
  blocked_since?: number | null;
};

export type UpdateKanbanCardInput = {
  id: string;
  title?: string;
  description?: string;
  priority?: KanbanPriority;
  role_id?: string | null;
  column_id?: string;
  task_id?: string | null;
  assignee?: string | null;
  workspace?: string | null;
  archived?: boolean;
  scheduled_for?: number | null;
  start_for?: number | null;
  started_at?: number | null;
  finished_at?: number | null;
  reason_code?: KanbanReasonCode | null;
  not_done_reason?: string | null;
  blocked_reason?: KanbanReasonCode | null;
  blocked_since?: number | null;
};

export type SetKanbanCardDependenciesInput = {
  card_id: string;
  depends_on: string[];
};

export type MoveKanbanCardInput = {
  id: string;
  column_id: string;
  position?: number;
};

export type CreateKanbanColumnInput = {
  board_id: string;
  name: string;
  color?: string;
};

export type UpdateKanbanColumnInput = {
  id: string;
  name?: string;
  color?: string;
};

export type DeleteKanbanColumnInput = {
  id: string;
};

export type DispatchKanbanCardInput = {
  card_id: string;
  mission: string;
  assistant_id?: string | null;
  team_id?: string | null;
  workspace?: string | null;
  workspace_root?: string | null;
  column_id?: string;
};

export type DispatchKanbanCardResult = {
  card: KanbanCard;
  task: Task;
  reused: boolean;
};

export type KanbanAutomationAction =
  | {
      type: 'create_card';
      title: string;
      description?: string;
      column_id?: string;
      role_id?: string | null;
      priority?: KanbanPriority;
      workspace?: string | null;
    }
  | { type: 'move_card'; card_id: string; column_id: string }
  | { type: 'assign_card'; card_id: string; role_id: string | null }
  | { type: 'dispatch_card'; card_id: string }
  | {
      type: 'update_card';
      card_id: string;
      title?: string;
      description?: string;
      priority?: KanbanPriority;
      role_id?: string | null;
    }
  | { type: 'archive_card'; card_id: string };

export type KanbanAutomationPlan = {
  summary: string;
  actions: KanbanAutomationAction[];
};

/** Built-in columns created for every new board. */
export const KANBAN_DEFAULT_COLUMNS = [
  { key: 'triage', color: '#6b7280' },
  { key: 'todo', color: '#64748b' },
  { key: 'scheduled', color: '#d97706' },
  { key: 'ready', color: '#2563eb' },
  { key: 'running', color: '#0ea5a4' },
  { key: 'review', color: '#7c3aed' },
  { key: 'done', color: '#16a34a' },
  { key: 'blocked', color: '#dc2626' },
] as const;

export type KanbanAPI = {
  list: (options?: KanbanListOptions) => Promise<KanbanBoard[]>;
  createBoard: (input: CreateKanbanBoardInput) => Promise<KanbanBoard>;
  updateBoard: (input: UpdateKanbanBoardInput) => Promise<KanbanBoard>;
  deleteBoard: (input: DeleteKanbanBoardInput) => Promise<DeleteKanbanBoardResult>;
  createRole: (input: CreateKanbanRoleInput) => Promise<KanbanRole>;
  updateRole: (input: UpdateKanbanRoleInput) => Promise<KanbanRole>;
  deleteRole: (input: DeleteKanbanRoleInput) => Promise<boolean>;
  createCard: (input: CreateKanbanCardInput) => Promise<KanbanCard>;
  updateCard: (input: UpdateKanbanCardInput) => Promise<KanbanCard>;
  moveCard: (input: MoveKanbanCardInput) => Promise<KanbanCard>;
  dispatchCard: (input: DispatchKanbanCardInput) => Promise<DispatchKanbanCardResult>;
  createColumn: (input: CreateKanbanColumnInput) => Promise<KanbanColumn>;
  updateColumn: (input: UpdateKanbanColumnInput) => Promise<KanbanColumn>;
  deleteColumn: (input: DeleteKanbanColumnInput) => Promise<boolean>;
};
