/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task runner — dispatches pending tasks to aioncore as real conversations and
 * records the agent's actual reply.
 *
 * Failure policy: every non-2xx response, timeout and empty turn marks the task
 * `failed`, carrying the backend's own message. A task becomes `completed` only
 * when aioncore reported the turn finished AND an assistant reply exists.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Task } from '@/common/task/taskTypes';
import { isTaskOnlyAssistant } from '@/common/task/taskAssistants';
import {
  createConversation,
  cancelConversation,
  ensureTeamSession,
  getConversation,
  getMessages,
  getTeam,
  listAssistants,
  sendMessage,
  sendTeamMessage,
  type AioncoreMessage,
} from './aioncoreClient';
import {
  claimNextPendingTask,
  getTask,
  markTaskCancelled,
  markTaskCompleted,
  markTaskFailed,
  setTaskConversation,
  type TaskDatabase,
} from './taskRepository';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1_000;
/** Transient poll failures tolerated before the turn is declared lost. */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

/** Mission directory inside the workspace. */
const MISSION_DIR = '.aion/mission';
/** Path to the mission state.json. */
function missionStatePath(workspace: string): string {
  return join(workspace, MISSION_DIR, 'state.json');
}

/** Best-effort write of the mission state.json. A file write failure
 *  must never fail the task. */
function writeMissionState(workspace: string, state: unknown): void {
  try {
    const path = missionStatePath(workspace);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch {
    // Tolerated — the task/mission proceeds without the durable mirror.
  }
}

/** Update only the `plan` field in state.json from an ACP
 *  `PlanUpdate` event emitted by the agent. The plan array is
 *  REPLACED wholesale with the most recent plan received from
 *  the agent — never synthesized locally. */
function writeMissionPlanUpdate(workspace: string, plan: unknown[]): void {
  try {
    const path = missionStatePath(workspace);
    const raw = readFileSync(path, 'utf8');
    const state = JSON.parse(raw) as { plan?: unknown[] };
    state.plan = plan;
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch {
    // Tolerated — state.json may not exist yet (mission not started).
  }
}

/** Write a task result markdown file into <workspace>/.aion/mission/results/. */
function writeTaskResult(workspace: string, taskId: string, status: string, detail: string): void {
  try {
    const resultsDir = join(workspace, MISSION_DIR, 'results');
    mkdirSync(resultsDir, { recursive: true });
    const safeName = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const md = [
      `# Task ${taskId}`,
      '',
      `- Status: ${status}`,
      `- ${status === 'completed' ? 'Result' : 'Detail'}: ${detail}`,
      '',
    ].join('\n');
    writeFileSync(join(resultsDir, `${safeName}.md`), md, 'utf8');
  } catch {
    // Tolerated.
  }
}

export type TaskRunnerOptions = {
  db: TaskDatabase;
  /** Resolves the live aioncore port — only known after backend startup. */
  getBackendPort: () => number;
  /** Workspace used when a task was created without one. */
  defaultWorkspace: string;
  pollIntervalMs?: number;
  turnTimeoutMs?: number;
  onTaskSettled?: (task: Task) => void;
  log?: (message: string) => void;
};

type TurnOutcome = { ok: true; reply: string | null } | { ok: false; error: string };

/** Thrown when a task is cancelled by the user while its turn is in flight. */
class TaskCancelledError extends Error {
  constructor() {
    super('task cancelled');
    this.name = 'TaskCancelledError';
  }
}

export class TaskRunner {
  private readonly db: TaskDatabase;
  private readonly getBackendPort: () => number;
  private readonly defaultWorkspace: string;
  private readonly pollIntervalMs: number;
  private readonly turnTimeoutMs: number;
  private readonly onTaskSettled?: (task: Task) => void;
  private readonly log: (message: string) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** Tasks explicitly cancelled by the user. Used to interrupt in-flight turns and release the serial queue. */
  private cancelled = new Set<string>();

  constructor(options: TaskRunnerOptions) {
    this.db = options.db;
    this.getBackendPort = options.getBackendPort;
    this.defaultWorkspace = options.defaultWorkspace;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.onTaskSettled = options.onTaskSettled;
    this.log = options.log ?? (() => {});
  }

  /** Begin polling for pending tasks. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  /** Stop polling. An in-flight turn settles on its own timeout. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Request cancellation of a running/pending task: mark it `cancelled` in the
   *  DB, interrupt the in-flight backend turn (best-effort), and release the
   *  serial queue within one poll interval. */
  async cancelTask(taskId: string): Promise<void> {
    this.cancelled.add(taskId);
    markTaskCancelled(this.db, taskId, null);
    const task = getTask(this.db, taskId);
    if (!task?.agent_id) return;
    try {
      const detail = await getConversation(this.getBackendPort(), task.agent_id);
      const turnId = detail.runtime?.turn_id ?? null;
      await cancelConversation(this.getBackendPort(), task.agent_id, turnId);
    } catch {
      // Backend unreachable or conversation already settled — the task is
      // already marked `cancelled` in the DB; `awaitTurn` detects it via
      // `this.cancelled` and `runTask` skips markTaskCompleted/markTaskFailed.
    }
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Drain the queue so a burst of tasks is not throttled by the poll interval.
      while (await this.runNext()) {
        /* keep draining */
      }
    } finally {
      this.busy = false;
    }
  }

  /** Claim and process one pending task. Returns false when none is waiting. */
  async runNext(): Promise<boolean> {
    const task = claimNextPendingTask(this.db);
    if (!task) return false;

    try {
      await this.runTask(task);
    } catch (error) {
      // runTask handles its own failures; this is the last-resort guard so an
      // unexpected throw never leaves a task stuck in `running` forever.
      markTaskFailed(this.db, task.id, error instanceof Error ? error.message : String(error));
    }

    const settled = getTask(this.db, task.id);
    if (settled) this.onTaskSettled?.(settled);
    return true;
  }

  private async runTask(task: Task): Promise<void> {
    const port = this.getBackendPort();
    if (!port || port <= 0) {
      markTaskFailed(this.db, task.id, 'aioncore is not running — cannot dispatch the task');
      return;
    }
    const workspace = task.workspace ?? this.defaultWorkspace;

    try {
      // Team missions skip single-assistant resolution entirely: the backend
      // routes them to the leader, which coordinates the members itself.
      if (task.team_id) {
        const teamConversationId = await this.dispatchTeamTask(port, task.team_id, task.mission);
        setTaskConversation(this.db, task.id, teamConversationId);
        this.log(`[TaskRunner] ${task.id} -> team conversation ${teamConversationId}`);
        // Persist the mission mirror so the .aion/mission layer can
        // track progress even for team missions.
        writeMissionState(workspace, {
          objective: task.mission,
          plan: [],
          turn_id: teamConversationId,
          workspace,
          project: null,
          target_url: '',
          evidence: {},
          result: null,
        });
        const teamReply = await this.awaitTurn(port, teamConversationId, task.id);
        const current = getTask(this.db, task.id);
        if (current?.status === 'cancelled') return;
        markTaskCompleted(this.db, task.id, teamReply);
        writeTaskResult(workspace, task.id, 'completed', teamReply);
        return;
      }

      const assistantId = task.assistant_id ?? (await this.resolveAssistantId(port));
      if (!assistantId) {
        markTaskFailed(this.db, task.id, 'no enabled assistant is available in aioncore to run this task');
        return;
      }

      mkdirSync(workspace, { recursive: true });

      // 1. Conversation. `extra.workspace` is mandatory; `title` / `type: 'task'`
      //    are not part of the create schema and are answered with a 400.
      const conversationId = await createConversation(port, {
        name: task.mission.slice(0, 80) || 'Task',
        assistantId,
        workspace,
      });
      setTaskConversation(this.db, task.id, conversationId);
      this.log(`[TaskRunner] ${task.id} -> conversation ${conversationId}`);
      // Persist the mission mirror so the .aion/mission layer can
      // track progress from the start of the turn.
      writeMissionState(workspace, {
        objective: task.mission,
        plan: [],
        turn_id: conversationId,
        workspace,
        project: null,
        target_url: '',
        evidence: {},
        result: null,
      });

      // 2. Message — starts the agent turn (202 Accepted).
      await sendMessage(port, conversationId, task.mission);

      // 3. Wait for the turn to finish and read the agent's real reply.
      const reply = await this.awaitTurn(port, conversationId, task.id);
      const current = getTask(this.db, task.id);
      if (current?.status === 'cancelled') {
        writeTaskResult(workspace, task.id, 'cancelled', 'user cancelled');
        return;
      }
      markTaskCompleted(this.db, task.id, reply);
      writeTaskResult(workspace, task.id, 'completed', reply);
    } catch (error) {
      // Cancellation wins over every other error: the task was
      // explicitly cancelled by the user, so the DB row is already
      // `cancelled` and the serial queue must be released.
      if (error instanceof TaskCancelledError) {
        writeTaskResult(workspace, task.id, 'cancelled', 'user cancelled');
        return;
      }
      // Every failure path — HTTP rejection, unusable workspace, timeout, agent
      // error turn — lands here with the backend's own message. Nothing is ever
      // reported as completed unless a real reply was read back.
      markTaskFailed(this.db, task.id, describeError(error));
      writeTaskResult(workspace, task.id, 'failed', describeError(error));
    }
  }

  /** Pick an enabled assistant, preferring a task-only one, then an online one. */
  private async resolveAssistantId(port: number): Promise<string | null> {
    const assistants = await listAssistants(port);
    const enabled = assistants.filter((assistant) => assistant.enabled !== false && Boolean(assistant.id));
    const online = enabled.filter((assistant) => assistant.agent_status === 'online');
    return (online.find((assistant) => isTaskOnlyAssistant(assistant)) ?? online[0] ?? enabled[0])?.id ?? null;
  }

  /**
   * Route a team mission: resolve the leader conversation, ensure the team
   * session is up and deliver the mission through the team endpoint. Returns
   * the leader conversation id so the caller awaits the leader's reply through
   * the regular single-conversation turn machinery.
   */
  private async dispatchTeamTask(port: number, teamId: string, mission: string): Promise<string> {
    const team = await getTeam(port, teamId);
    if (!team) {
      throw new Error(`team ${teamId} was not found in aioncore`);
    }
    const leader =
      team.assistants?.find((assistant) => assistant.slot_id === team.leader_assistant_id) ??
      team.assistants?.find((assistant) => assistant.role === 'leader');
    if (!leader?.conversation_id) {
      throw new Error(`team ${teamId} has no leader conversation`);
    }

    // Best effort: a stopped session must come up before the mission lands.
    // A session already running answers the same way, so failure here is not
    // fatal — the send below reports the real error if the team cannot run.
    await ensureTeamSession(port, teamId).catch((): undefined => undefined);
    await sendTeamMessage(port, teamId, mission);

    // Wait briefly for the leader turn to leave `idle` (≤5 s at 100 ms ticks)
    // so the first poll of `awaitTurn` cannot mistake the pre-run state for
    // completion and harvest a stale reply. A turn that stays queued simply
    // exhausts the window and normal polling takes over.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      let state = 'idle';
      try {
        state = (await getConversation(port, leader.conversation_id)).runtime?.state ?? 'idle';
      } catch {
        break; // transport hiccup — let awaitTurn apply its retry tolerance
      }
      if (state !== 'idle') break;
      await delay(100);
    }

    return leader.conversation_id;
  }

  /**
   * Poll until the conversation reports `runtime.state === 'idle'`, then read the
   * transcript and return the agent's reply.
   *
   * Poll errors are tolerated a few times (the backend may be restarting), but a
   *  sustained outage throws instead of silently waiting out the whole timeout.
   *  If the task is cancelled while polling, throws `TaskCancelledError` immediately
   *  so the serial queue is released within one poll interval.
   */
  private async awaitTurn(port: number, conversationId: string, taskId: string): Promise<string | null> {
    const deadline = Date.now() + this.turnTimeoutMs;
    let consecutiveErrors = 0;

    while (Date.now() < deadline) {
      // If the user cancelled this task, bail out immediately and release
      // the serial queue. `cancelTask` already marked the DB row `cancelled`.
      if (this.cancelled.has(taskId)) {
        throw new TaskCancelledError();
      }
      let detail;
      try {
        detail = await getConversation(port, conversationId);
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          throw new Error(`lost contact with aioncore while waiting for the turn: ${describeError(error)}`, {
            cause: error,
          });
        }
        await delay(this.pollIntervalMs);
        continue;
      }
      if ((detail.runtime?.state ?? '') === 'idle') {
        // Transcript errors propagate immediately: once the turn is idle, a
        // missing or error reply is the task outcome — never a poll blip.
        // (extractReply throwing inside the try above used to be swallowed by
        // the poll tolerance and surfaced as a generic timeout instead of the
        // real cause, e.g. `Not logged in`.)
        return this.extractReply(await getMessages(port, conversationId));
      }
      await delay(this.pollIntervalMs);
    }

    throw new Error(`the turn did not finish within ${Math.round(this.turnTimeoutMs / 1000)}s`);
  }

  /**
   * Read the agent's answer from the transcript.
   *
   * Assistant messages are the ones aioncore positions on the `left`. A reply
   * carrying `status: 'error'` (e.g. `Not logged in · Please run /login`) is a
   * task failure — reporting it as success is exactly the bug this module exists
   * to prevent.
   */
  private extractReply(messages: AioncoreMessage[]): string | null {
    const replies = messages.filter((message) => message.position === 'left' && message.type === 'text');
    const last = replies[replies.length - 1];
    if (!last) {
      throw new Error('the agent finished the turn without producing a reply');
    }
    const text = this.messageText(last) || null;
    if (last.status === 'error') {
      throw new Error(text ?? 'the agent reported an error turn');
    }
    return text;
  }

  private messageText(message: AioncoreMessage): string {
    const content = message.content;
    if (typeof content === 'string') return content.trim();
    if (content && typeof content === 'object' && typeof content.content === 'string') {
      return content.content.trim();
    }
    return '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize an unknown thrown value into a message worth showing the user. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
