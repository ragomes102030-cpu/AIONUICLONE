/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Spin,
  Tag,
  Tooltip,
} from '@arco-design/web-react';
import { Delete, Edit, MoreOne, Plus, Refresh, Robot, Send } from '@icon-park/react';
import type { Task } from '@/common/task/taskTypes';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  deriveScheduleStatus,
  type CreateKanbanCardInput,
  type KanbanAutomationPlan,
  type KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
  type KanbanPriority,
  type KanbanReasonCode,
  KANBAN_REASON_CODES,
  blockedAgeDays,
  isCardAtRisk,
  rankByImpact,
  type CardImpact,
  type KanbanRole,
  type KanbanScheduleStatus,
  type UpdateKanbanCardInput,
} from '@/common/kanban/kanbanTypes';
import { useAssistantList } from '@renderer/hooks/assistant/useAssistantList';
import { selectableAssistants } from '@renderer/utils/model/assistantSelection';
import { BoardAutomationModal } from './BoardAutomationModal';
import { buildDispatchMission } from './boardAutomation';
import { useKanban } from './useKanban';

const BUILTIN_COLUMN_KEYS = new Set(['triage', 'todo', 'scheduled', 'ready', 'running', 'review', 'done', 'blocked']);

const DECISIONS_COLUMN_KEY = 'decisoes';
const COLUMN_I18N_KEYS: Record<string, string> = {
  triage: 'agentTasks.kanban.columns.triage',
  todo: 'agentTasks.kanban.columns.todo',
  scheduled: 'agentTasks.kanban.columns.scheduled',
  ready: 'agentTasks.kanban.columns.ready',
  running: 'agentTasks.kanban.columns.running',
  review: 'agentTasks.kanban.columns.review',
  done: 'agentTasks.kanban.columns.done',
  blocked: 'agentTasks.kanban.columns.blocked',
  custom: 'agentTasks.kanban.columns.custom',
};

type CardDraft = {
  title: string;
  description: string;
  priority: KanbanPriority;
  roleId: string | null;
  workspace: string;
  scheduledFor: number | null;
  assignee: string;
  reasonCode: KanbanReasonCode | null;
};

type RoleDraft = {
  roleId: string | null;
  assistantId: string;
  name: string;
  responsibility: string;
  color: string;
};

const priorityColor: Record<KanbanPriority, string> = {
  P0: 'red',
  P1: 'orange',
  P2: 'blue',
  P3: 'gray',
};

function columnLabel(t: ReturnType<typeof useTranslation>['t'], column: KanbanColumn): string {
  const key = BUILTIN_COLUMN_KEYS.has(column.key) ? COLUMN_I18N_KEYS[column.key] : COLUMN_I18N_KEYS.custom;
  return t(key, { defaultValue: column.name || column.key });
}

function formatAge(timestamp: number, t: ReturnType<typeof useTranslation>['t']): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t('agentTasks.kanban.justNow', { defaultValue: 'now' });
  if (minutes < 60) return t('agentTasks.kanban.minutesAgo', { count: minutes, defaultValue: `${minutes}m` });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('agentTasks.kanban.hoursAgo', { count: hours, defaultValue: `${hours}h` });
  return t('agentTasks.kanban.daysAgo', { count: Math.floor(hours / 24), defaultValue: `${Math.floor(hours / 24)}d` });
}

const SCHEDULE_STATUS_TAG: Record<KanbanScheduleStatus, string> = {
  done: 'green',
  archived: 'gray',
  late_finish: 'red',
  in_progress: 'blue',
  overdue: 'red',
  due_soon: 'orange',
  scheduled: 'arcoblue',
  not_started: 'gray',
};

function formatScheduleTime(timestamp: number, t: ReturnType<typeof useTranslation>['t']): string {
  return t('agentTasks.kanban.at', {
    value: new Date(timestamp).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    defaultValue: new Date(timestamp).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

/**
 * Ticks so a card crosses into `overdue` on its own. The board is often left
 * open for hours, and a service that quietly became late must not wait for a
 * manual refresh to show it.
 */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function KanbanCardView({
  card,
  columns,
  now,
  atRisk,
  role,
  task,
  t,
  onOpen,
  onOpenConversation,
  onDispatch,
  onArchive,
  onDragStart,
  onDragEnd,
  dragging,
  onReceipt,
  dispatching,
}: {
  card: KanbanCard;
  columns: KanbanColumn[];
  now: number;
  atRisk: boolean;
  role?: KanbanRole;
  task?: Task;
  t: ReturnType<typeof useTranslation>['t'];
  onOpen: () => void;
  onOpenConversation: () => void;
  onDispatch: () => void;
  onArchive: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  onReceipt: (card: KanbanCard, patch: UpdateKanbanCardInput) => void;
  dispatching: boolean;
}) {
  const scheduleStatus = deriveScheduleStatus(card, columns, now);
  const isOverdue = scheduleStatus === 'overdue';
  const riskBorder = isOverdue
    ? 'border-danger-5 hover:border-danger-5'
    : atRisk
      ? 'border-warning-5 hover:border-warning-5'
      : 'border-[var(--color-border-2)] hover:border-primary';
  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/kanban-card', card.id);
        onDragStart();
      }}
      onDragEnd={() => onDragEnd()}
      onClick={onOpen}
      className={`group cursor-grab rounded-10px border border-solid bg-[var(--color-bg-2)] p-10px shadow-sm transition hover:-translate-y-1px hover:shadow-md active:cursor-grabbing ${
        dragging ? 'rotate-1 opacity-50 shadow-lg' : ''
      } ${riskBorder}`}
    >
      <div className='flex items-start gap-8px'>
        <span className='min-w-0 flex-1 text-13px leading-18px font-medium text-t-primary'>{card.title}</span>
        {atRisk ? (
          <Tag size='small' color='orange' className='shrink-0'>
            {t('agentTasks.kanban.atRisk', { defaultValue: 'Em risco' })}
          </Tag>
        ) : null}
        <Tag size='small' color={priorityColor[card.priority]} className='shrink-0'>
          {card.priority}
        </Tag>
      </div>
      {card.description ? (
        <p className='mt-6px line-clamp-3 text-12px leading-17px text-t-secondary'>{card.description}</p>
      ) : null}
      {card.scheduled_for !== null ||
      card.started_at !== null ||
      card.finished_at !== null ||
      card.blocked_reason !== null ? (
        <div className='mt-8px flex flex-wrap items-center gap-5px'>
          {card.blocked_reason !== null ? (
            // The impediment and how long it has been standing are the two facts
            // that turn "blocked" into something to act on: two days is a phone
            // call, three weeks is an escalation.
            <Tag size='small' color='red' className='shrink-0'>
              {t(`agentTasks.kanban.reasons.${card.blocked_reason}`, { defaultValue: card.blocked_reason })}
              {blockedAgeDays(card, now) !== null ? ` · ${blockedAgeDays(card, now)}d` : ''}
            </Tag>
          ) : null}
          {card.scheduled_for !== null ? (
            <Tag size='small' color={SCHEDULE_STATUS_TAG[scheduleStatus]} className='shrink-0'>
              {scheduleStatus === 'due_soon'
                ? t('agentTasks.kanban.dueSoon', { defaultValue: 'A vencer' })
                : t('agentTasks.kanban.scheduledFor', { defaultValue: 'Marcado' })}{' '}
              {formatScheduleTime(card.scheduled_for, t)}
            </Tag>
          ) : null}
          {card.started_at !== null ? (
            <Tag size='small' color='blue' className='shrink-0'>
              {t('agentTasks.kanban.startedAt', { defaultValue: 'Iniciou' })} {formatScheduleTime(card.started_at, t)}
            </Tag>
          ) : null}
          {card.finished_at !== null ? (
            <Tag size='small' color={scheduleStatus === 'late_finish' ? 'red' : 'green'} className='shrink-0'>
              {scheduleStatus === 'late_finish'
                ? t('agentTasks.kanban.finishedLate', { defaultValue: 'Concluiu atrasado' })
                : t('agentTasks.kanban.finishedAt', { defaultValue: 'Concluiu' })}{' '}
              {formatScheduleTime(card.finished_at, t)}
            </Tag>
          ) : null}
          {card.not_done_reason ? (
            <Tooltip content={card.not_done_reason}>
              <span className='line-clamp-1 text-11px text-danger-6'>{card.not_done_reason}</span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
      {card.assignee ? (
        <p className='mt-6px text-11px text-t-secondary'>
          {t('agentTasks.kanban.fieldCrew', { defaultValue: 'Responsável' })}: {card.assignee}
        </p>
      ) : null}
      {task?.result ? (
        <p className='mt-6px line-clamp-2 rounded-6px bg-[var(--color-fill-2)] px-6px py-4px text-11px leading-15px text-t-secondary'>
          {task.result}
        </p>
      ) : null}
      {task?.error ? (
        <p className='mt-6px line-clamp-2 rounded-6px bg-danger-1 px-6px py-4px text-11px leading-15px text-danger-6'>
          {task.error}
        </p>
      ) : null}
      {card.scheduled_for !== null && card.finished_at === null ? (
        <div className='mt-8px flex flex-wrap gap-6px' onClick={(event) => event.stopPropagation()}>
          {card.started_at === null ? (
            <Button
              size='small'
              type='primary'
              className='min-h-32px flex-1'
              onClick={() => onReceipt(card, { id: card.id, started_at: now, not_done_reason: null })}
            >
              {t('agentTasks.kanban.markStarted', { defaultValue: 'Iniciar' })}
            </Button>
          ) : (
            <>
              <Button
                size='small'
                type='primary'
                className='min-h-32px flex-1'
                onClick={() => onReceipt(card, { id: card.id, finished_at: now, not_done_reason: null })}
              >
                {t('agentTasks.kanban.markFinished', { defaultValue: 'Concluir' })}
              </Button>
              <Popover
                trigger='click'
                position='br'
                content={
                  <div className='flex flex-col gap-4px'>
                    {KANBAN_REASON_CODES.map((code) => (
                      <Button
                        key={code}
                        size='small'
                        className='min-h-32px justify-start'
                        onClick={() => onReceipt(card, { id: card.id, reason_code: code })}
                      >
                        {t(`agentTasks.kanban.reasons.${code}`, { defaultValue: code })}
                      </Button>
                    ))}
                  </div>
                }
              >
                <Button size='small' className='min-h-32px px-8px'>
                  {t('agentTasks.kanban.markNotDone', { defaultValue: 'Não deu' })}
                </Button>
              </Popover>
            </>
          )}
          {card.finished_at === null ? (
            card.blocked_reason !== null ? (
              <Button
                size='small'
                className='min-h-32px px-8px'
                onClick={() => onReceipt(card, { id: card.id, blocked_reason: null, blocked_since: null })}
              >
                {t('agentTasks.kanban.clearImpediment', { defaultValue: 'Liberar' })}
              </Button>
            ) : (
              <Popover
                trigger='click'
                position='br'
                content={
                  <div className='flex flex-col gap-4px'>
                    {KANBAN_REASON_CODES.map((code) => (
                      <Button
                        key={code}
                        size='small'
                        className='min-h-32px justify-start'
                        // The clock starts when the impediment is declared, not
                        // when it is eventually noticed.
                        onClick={() => onReceipt(card, { id: card.id, blocked_reason: code, blocked_since: now })}
                      >
                        {t(`agentTasks.kanban.reasons.${code}`, { defaultValue: code })}
                      </Button>
                    ))}
                  </div>
                }
              >
                <Button size='small' className='min-h-32px px-8px'>
                  {t('agentTasks.kanban.markImpediment', { defaultValue: 'Impedir' })}
                </Button>
              </Popover>
            )
          ) : null}
        </div>
      ) : null}
      <div className='mt-10px flex items-center justify-between gap-8px'>
        <div className='flex min-w-0 items-center gap-6px'>
          {role ? (
            <Tooltip
              content={`${role.name} · ${role.responsibility || t('agentTasks.kanban.noResponsibility', { defaultValue: 'Sem responsabilidade definida' })}`}
            >
              <span className='flex min-w-0 items-center gap-5px text-11px text-t-secondary'>
                <span className='size-7px shrink-0 rounded-full' style={{ background: role.color }} />
                <span className='truncate'>{role.name}</span>
              </span>
            </Tooltip>
          ) : (
            <span className='text-11px text-t-tertiary'>
              {t('agentTasks.kanban.unassigned', { defaultValue: 'Sem responsável' })}
            </span>
          )}
        </div>
        <span className='shrink-0 text-11px text-t-tertiary'>{formatAge(card.created_at, t)}</span>
      </div>
      <div className='mt-8px flex items-center justify-between gap-8px border-t border-solid border-[var(--color-border-3)] pt-8px'>
        <div className='min-w-0'>
          {task ? (
            <Tag
              size='small'
              color={
                task.status === 'completed'
                  ? 'green'
                  : task.status === 'failed'
                    ? 'red'
                    : task.status === 'running'
                      ? 'blue'
                      : 'orange'
              }
            >
              {t(`agentTasks.status${task.status.charAt(0).toUpperCase()}${task.status.slice(1)}`)}
            </Tag>
          ) : (
            <span className='text-11px text-t-tertiary'>
              {t('agentTasks.kanban.notDispatched', { defaultValue: 'Não despachado' })}
            </span>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-4px' onClick={(event) => event.stopPropagation()}>
          {task?.agent_id ? (
            <Button
              type='text'
              size='mini'
              onClick={onOpenConversation}
              aria-label={t('agentTasks.kanban.openConversation', { defaultValue: 'Abrir conversa' })}
            >
              {t('agentTasks.kanban.openConversation', { defaultValue: 'Conversa' })}
            </Button>
          ) : null}
          <Tooltip content={t('agentTasks.kanban.dispatch', { defaultValue: 'Dispatch' })}>
            <Button
              type='text'
              size='mini'
              icon={<Send size={13} />}
              loading={dispatching}
              disabled={Boolean(task && (task.status === 'pending' || task.status === 'running'))}
              onClick={onDispatch}
              aria-label={t('agentTasks.kanban.dispatch', { defaultValue: 'Dispatch' })}
            />
          </Tooltip>
          <Popconfirm
            content={t('agentTasks.kanban.archiveConfirm', { defaultValue: 'Archive this card?' })}
            onConfirm={onArchive}
          >
            <Button
              type='text'
              size='mini'
              status='danger'
              icon={<Delete size={13} />}
              aria-label={t('agentTasks.kanban.archive', { defaultValue: 'Archive card' })}
            />
          </Popconfirm>
        </div>
      </div>
    </article>
  );
}

function KanbanColumnView({
  column,
  cards,
  columns,
  now,
  atRiskIds,
  roleById,
  taskById,
  t,
  onDropCard,
  onOpenCard,
  onOpenConversation,
  onDispatchCard,
  onArchiveCard,
  onDragStart,
  onDragEnd,
  draggedCardId,
  onReceipt,
  dispatchingCardId,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  columns: KanbanColumn[];
  now: number;
  atRiskIds: Set<string>;
  roleById: Map<string, KanbanRole>;
  taskById: Map<string, Task>;
  t: ReturnType<typeof useTranslation>['t'];
  onDropCard: (cardId: string, columnId: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onOpenConversation: (task: Task) => void;
  onDispatchCard: (card: KanbanCard) => void;
  onArchiveCard: (card: KanbanCard) => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  draggedCardId: string | null;
  onReceipt: (card: KanbanCard, patch: UpdateKanbanCardInput) => void;
  dispatchingCardId: string | null;
}) {
  const [dropActive, setDropActive] = useState(false);
  const isArchive = column.key === 'finalizados';
  if (isArchive) {
    const done = [...cards].sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0));
    return (
      <section className='flex w-full shrink-0 flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] md:h-full md:w-260px'>
        <header className='flex items-center gap-8px border-b border-solid border-[var(--color-border-2)] px-12px py-10px'>
          <span className='size-8px rounded-full' style={{ background: column.color }} />
          <h2 className='m-0 min-w-0 flex-1 truncate text-13px font-semibold text-t-primary'>
            {column.name || t('agentTasks.kanban.columnFinished', { defaultValue: 'Finalizados' })}
          </h2>
          <span className='rounded-full bg-[var(--color-fill-3)] px-7px py-2px text-11px text-t-secondary'>
            {cards.length}
          </span>
        </header>
        <div className='min-h-0 flex-1 space-y-6px overflow-y-auto p-8px'>
          {done.length === 0 ? (
            <p className='px-4px py-8px text-12px text-t-tertiary'>
              {t('agentTasks.kanban.noFinished', { defaultValue: 'Serviços concluídos ficam aqui como histórico.' })}
            </p>
          ) : null}
          {done.map((card) => (
            <button
              key={card.id}
              type='button'
              onClick={() => onOpenCard(card)}
              className='w-full rounded-8px border border-solid border-[var(--color-border-3)] bg-[var(--color-bg-2)] px-10px py-8px text-left transition hover:border-primary'
            >
              <span className='block truncate text-13px text-t-secondary'>{card.title}</span>
              <span className='mt-3px block truncate text-11px text-t-tertiary'>
                {card.assignee || t('agentTasks.kanban.panelNoCrew', { defaultValue: 'Sem equipe' })}
                {card.finished_at !== null ? ` · ${formatScheduleTime(card.finished_at, t)}` : ''}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`flex w-full shrink-0 flex-col rounded-12px border border-solid bg-[var(--color-fill-1)] transition-colors md:h-full md:w-260px ${
        dropActive ? 'border-primary bg-[var(--color-fill-2)]' : 'border-[var(--color-border-2)]'
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const cardId = event.dataTransfer.getData('text/kanban-card');
        if (cardId) onDropCard(cardId, column.id);
      }}
    >
      <header className='flex items-center gap-8px border-b border-solid border-[var(--color-border-2)] px-12px py-10px'>
        <span className='size-8px rounded-full' style={{ background: column.color }} />
        <h2 className='m-0 min-w-0 flex-1 truncate text-13px font-semibold text-t-primary'>{columnLabel(t, column)}</h2>
        <span className='rounded-full bg-[var(--color-fill-3)] px-7px py-2px text-11px text-t-secondary'>
          {cards.length}
        </span>
      </header>
      <div className='min-h-0 flex-1 space-y-8px overflow-y-auto p-8px'>
        {cards.length === 0 ? (
          <div className='flex h-100px items-center justify-center rounded-8px border border-dashed border-[var(--color-border-2)] text-12px text-t-tertiary'>
            {t('agentTasks.kanban.dropHere', { defaultValue: 'Solte um card aqui' })}
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCardView
              key={card.id}
              card={card}
              columns={columns}
              now={now}
              atRisk={atRiskIds.has(card.id)}
              role={card.role_id ? roleById.get(card.role_id) : undefined}
              task={card.task_id ? taskById.get(card.task_id) : undefined}
              t={t}
              onOpen={() => onOpenCard(card)}
              onOpenConversation={() => {
                const task = card.task_id ? taskById.get(card.task_id) : undefined;
                if (task) onOpenConversation(task);
              }}
              onDispatch={() => onDispatchCard(card)}
              onArchive={() => onArchiveCard(card)}
              onDragStart={() => onDragStart(card.id)}
              onDragEnd={onDragEnd}
              dragging={draggedCardId === card.id}
              onReceipt={onReceipt}
              dispatching={dispatchingCardId === card.id}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DispatchCardModal({
  visible,
  card,
  role,
  assistantName,
  t,
  onClose,
  onConfirm,
  sending,
}: {
  visible: boolean;
  card: KanbanCard | null;
  role?: KanbanRole;
  assistantName: string | null;
  t: ReturnType<typeof useTranslation>['t'];
  onClose: () => void;
  onConfirm: (mission: string) => Promise<void>;
  sending: boolean;
}) {
  const [mission, setMission] = useState('');
  useEffect(() => {
    if (!visible || !card) return;
    setMission(buildDispatchMission(card, role));
  }, [card, role, visible]);

  return (
    <Modal
      visible={visible}
      title={t('agentTasks.kanban.dispatchTitle', { defaultValue: 'Despachar para o agente' })}
      onCancel={onClose}
      onOk={() => void onConfirm(mission)}
      okText={t('agentTasks.kanban.dispatchConfirm', { defaultValue: 'Despachar' })}
      confirmLoading={sending}
      okButtonProps={{ disabled: !mission.trim() }}
      style={{ width: 620, borderRadius: '12px' }}
      alignCenter
      getPopupContainer={() => document.body}
    >
      <div className='space-y-12px'>
        <div className='rounded-8px bg-[var(--color-fill-2)] px-12px py-10px text-12px leading-18px text-t-secondary'>
          <p>
            {t('agentTasks.kanban.dispatchExplains', {
              defaultValue:
                'O card vira uma conversa real no AionCore. O agente recebe a missão abaixo, trabalha no workspace e a resposta volta para o card.',
            })}
          </p>
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.dispatchTo', { defaultValue: 'Quem vai executar' })}
          </label>
          <div className='text-13px text-t-primary'>
            {role ? role.name : t('agentTasks.kanban.unassigned', { defaultValue: 'Sem responsável' })}
            {assistantName ? ` · ${assistantName}` : ''}
          </div>
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.dispatchWhere', { defaultValue: 'Onde o agente vai trabalhar' })}
          </label>
          <div className='text-13px text-t-primary'>
            {card?.workspace || t('agentTasks.kanban.workspaceDefault', { defaultValue: 'Workspace padrão do app' })}
          </div>
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.dispatchMission', { defaultValue: 'Missão enviada ao agente' })}
          </label>
          <Input.TextArea
            value={mission}
            onChange={(value) => setMission(value)}
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </div>
      </div>
    </Modal>
  );
}

function DecisionPanel({
  impacts,
  cardsById,
  t,
  onOpenCard,
}: {
  impacts: readonly CardImpact[];
  cardsById: ReadonlyMap<string, KanbanCard>;
  t: ReturnType<typeof useTranslation>['t'];
  onOpenCard: (cardId: string) => void;
}) {
  const blockers = impacts.filter((item) => item.blocksCount > 0);
  const waiting = impacts.filter((item) => item.blocksCount === 0 && item.lateDependencies.length > 0);
  if (blockers.length === 0 && waiting.length === 0) {
    return (
      <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-14px py-12px text-12px text-t-secondary'>
        {t('agentTasks.kanban.panelClear', {
          defaultValue: 'Nada atrasado segurando a obra. O que está em dia não precisa de decisão.',
        })}
      </div>
    );
  }

  const line = (item: CardImpact, waitingOn: boolean) => {
    const card = cardsById.get(item.card_id);
    const scheduled = card?.scheduled_for;
    return (
      <button
        key={item.card_id}
        type='button'
        onClick={() => onOpenCard(item.card_id)}
        className={`group flex w-full items-center gap-10px rounded-8px px-12px py-10px text-left transition hover:bg-[var(--color-fill-2)] ${
          waitingOn ? 'opacity-70' : ''
        }`}
      >
        <span className={`size-8px shrink-0 rounded-full ${waitingOn ? 'bg-warning-5' : 'bg-danger-5'}`} aria-hidden />
        <span className='min-w-0 flex-1'>
          <span
            className={`block truncate leading-20px ${
              waitingOn ? 'text-13px text-t-secondary' : 'text-13px font-medium text-t-primary'
            }`}
          >
            {item.title}
          </span>
          <span className='block truncate text-11px leading-16px text-t-tertiary'>
            {item.assignee || t('agentTasks.kanban.panelNoCrew', { defaultValue: 'Sem equipe' })}
            {scheduled ? ` · ${formatScheduleTime(scheduled, t)}` : ''}
          </span>
        </span>
        {waitingOn ? (
          <span className='shrink-0 text-12px text-t-tertiary'>
            {t('agentTasks.kanban.panelWaiting', { defaultValue: 'esperando' })}
          </span>
        ) : (
          <span className='shrink-0 text-12px font-medium text-t-secondary'>
            {t('agentTasks.kanban.panelBlocks', { defaultValue: 'travando {{count}}', count: item.blocksCount })}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className='py-4px'>
      {[...blockers.map((item) => [item, false] as const), ...waiting.map((item) => [item, true] as const)].map(
        ([item, waitingOn]) => line(item, waitingOn)
      )}
    </div>
  );
}

function CardEditorModal({
  visible,
  card,
  board,
  roles,
  t,
  onClose,
  onSave,
  onArchive,
}: {
  visible: boolean;
  card: KanbanCard | null;
  board: KanbanBoard;
  roles: KanbanRole[];
  t: ReturnType<typeof useTranslation>['t'];
  onClose: () => void;
  onSave: (input: CreateKanbanCardInput | UpdateKanbanCardInput) => Promise<void>;
  onArchive: (card: KanbanCard) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CardDraft>({
    title: '',
    description: '',
    priority: 'P2',
    roleId: null,
    workspace: '',
    scheduledFor: null,
    assignee: '',
    reasonCode: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft({
      title: card?.title ?? '',
      description: card?.description ?? '',
      priority: card?.priority ?? 'P2',
      roleId: card?.role_id ?? roles[0]?.id ?? null,
      workspace: card?.workspace ?? '',
      scheduledFor: card?.scheduled_for ?? null,
      assignee: card?.assignee ?? '',
      reasonCode: card?.reason_code ?? null,
    });
  }, [card, roles, visible]);

  const recordReceipt = async (patch: Partial<UpdateKanbanCardInput>) => {
    if (!card) return;
    setSaving(true);
    try {
      await onSave({ id: card.id, ...patch });
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(
        card
          ? {
              id: card.id,
              title: draft.title,
              description: draft.description,
              priority: draft.priority,
              role_id: draft.roleId,
              workspace: draft.workspace,
              scheduled_for: draft.scheduledFor,
              assignee: draft.assignee,
              reason_code: draft.reasonCode,
            }
          : {
              board_id: board.id,
              column_id: board.columns.find((column) => column.key === 'triage')?.id ?? board.columns[0]?.id ?? '',
              title: draft.title,
              description: draft.description,
              priority: draft.priority,
              role_id: draft.roleId,
              workspace: draft.workspace,
              scheduled_for: draft.scheduledFor,
              assignee: draft.assignee,
            }
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={
        card
          ? t('agentTasks.kanban.editCard', { defaultValue: 'Editar card' })
          : t('agentTasks.kanban.newCard', { defaultValue: 'Novo card' })
      }
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okButtonProps={{ disabled: !draft.title.trim() }}
      style={{ borderRadius: '12px' }}
      alignCenter
      getPopupContainer={() => document.body}
    >
      <div className='space-y-14px'>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.cardTitle', { defaultValue: 'Título' })}
          </label>
          <Input value={draft.title} onChange={(value) => setDraft((prev) => ({ ...prev, title: value }))} autoFocus />
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.description', { defaultValue: 'Descrição' })}
          </label>
          <Input.TextArea
            value={draft.description}
            onChange={(value) => setDraft((prev) => ({ ...prev, description: value }))}
            autoSize={{ minRows: 4, maxRows: 10 }}
          />
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.scheduledForLabel', { defaultValue: 'Marcado para' })}
          </label>
          <DatePicker
            showTime
            style={{ width: '100%' }}
            value={draft.scheduledFor}
            onChange={(value) => setDraft((prev) => ({ ...prev, scheduledFor: value ? Number(value) : null }))}
          />
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.fieldCrew', { defaultValue: 'Responsável de campo' })}
          </label>
          <Input
            value={draft.assignee}
            placeholder={t('agentTasks.kanban.fieldCrewPlaceholder', { defaultValue: 'Zezinho e Luizinho' })}
            onChange={(value) => setDraft((prev) => ({ ...prev, assignee: value }))}
          />
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.reasonCode', { defaultValue: 'Motivo (catálogo)' })}
          </label>
          <Select
            allowClear
            value={draft.reasonCode ?? undefined}
            placeholder={t('agentTasks.kanban.reasonCodePlaceholder', { defaultValue: 'Selecione um motivo' })}
            options={KANBAN_REASON_CODES.map((code) => ({
              value: code,
              label: t(`agentTasks.kanban.reasons.${code}`, { defaultValue: code }),
            }))}
            onChange={(value) => setDraft((prev) => ({ ...prev, reasonCode: (value as KanbanReasonCode) ?? null }))}
          />
        </div>
        {card ? (
          <div>
            <label className='mb-6px block text-12px text-t-secondary'>
              {t('agentTasks.kanban.receipt', { defaultValue: 'Recibo do campo' })}
            </label>
            <div className='flex flex-wrap items-center gap-8px'>
              <Button
                size='small'
                type='primary'
                disabled={card.started_at !== null}
                onClick={() => void recordReceipt({ started_at: Date.now(), not_done_reason: null })}
              >
                {t('agentTasks.kanban.markStarted', { defaultValue: 'Iniciar' })}
              </Button>
              <Button
                size='small'
                disabled={card.finished_at !== null}
                onClick={() => void recordReceipt({ finished_at: Date.now(), not_done_reason: null })}
              >
                {t('agentTasks.kanban.markFinished', { defaultValue: 'Concluir' })}
              </Button>
              <Input
                style={{ maxWidth: '240px' }}
                placeholder={t('agentTasks.kanban.notDoneReason', { defaultValue: 'Motivo de não conclusão' })}
                defaultValue={card.not_done_reason ?? ''}
                onBlur={(event) => {
                  const reason = event.target.value.trim() || null;
                  if (reason !== card.not_done_reason) void recordReceipt({ not_done_reason: reason });
                }}
              />
            </div>
          </div>
        ) : null}
        <div className='grid grid-cols-2 gap-10px'>
          <div>
            <label className='mb-6px block text-12px text-t-secondary'>
              {t('agentTasks.kanban.priority', { defaultValue: 'Prioridade' })}
            </label>
            <Select
              value={draft.priority}
              onChange={(value) => setDraft((prev) => ({ ...prev, priority: value as KanbanPriority }))}
            >
              {(['P0', 'P1', 'P2', 'P3'] as KanbanPriority[]).map((priority) => (
                <Select.Option key={priority} value={priority}>
                  {priority}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <label className='mb-6px block text-12px text-t-secondary'>
              {t('agentTasks.kanban.owner', { defaultValue: 'Responsável' })}
            </label>
            <Select
              value={draft.roleId ?? undefined}
              placeholder={t('agentTasks.kanban.unassigned', { defaultValue: 'Sem responsável' })}
              onChange={(value) => setDraft((prev) => ({ ...prev, roleId: value }))}
              allowClear
            >
              {roles.map((role) => (
                <Select.Option key={role.id} value={role.id}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className='mb-6px block text-12px text-t-secondary'>
            {t('agentTasks.kanban.workspace', { defaultValue: 'Workspace (opcional)' })}
          </label>
          <Input
            value={draft.workspace}
            onChange={(value) => setDraft((prev) => ({ ...prev, workspace: value }))}
            placeholder={t('agentTasks.kanban.workspacePlaceholder', { defaultValue: 'Usar workspace padrão' })}
          />
        </div>
      </div>
      {card ? (
        <div className='mt-18px border-t border-solid border-[var(--color-border-2)] pt-14px'>
          <Popconfirm
            content={t('agentTasks.kanban.archiveConfirm', { defaultValue: 'Archive this card?' })}
            onConfirm={() => void onArchive(card)}
          >
            <Button status='danger' type='text' icon={<Delete size={14} />}>
              {t('agentTasks.kanban.archive', { defaultValue: 'Arquivar card' })}
            </Button>
          </Popconfirm>
        </div>
      ) : null}
    </Modal>
  );
}

function RoleManagerModal({
  visible,
  board,
  assistants,
  t,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  board: KanbanBoard;
  assistants: Assistant[];
  t: ReturnType<typeof useTranslation>['t'];
  onClose: () => void;
  onSave: (draft: RoleDraft) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const next: Record<string, RoleDraft> = {};
    for (const assistant of assistants) {
      const role = board.roles.find((item) => item.assistant_id === assistant.id && !item.team_id);
      next[assistant.id] = {
        roleId: role?.id ?? null,
        assistantId: assistant.id,
        name: role?.name ?? assistant.name,
        responsibility: role?.responsibility ?? '',
        color: role?.color ?? '#3b82f6',
      };
    }
    setDrafts(next);
  }, [assistants, board.roles, visible]);

  const save = async (assistantId: string) => {
    const draft = drafts[assistantId];
    if (!draft?.name.trim()) return;
    setSaving(assistantId);
    try {
      await onSave(draft);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('agentTasks.kanban.owners', { defaultValue: 'Responsáveis' })}
      onCancel={onClose}
      footer={null}
      style={{ width: 680, borderRadius: '12px' }}
      alignCenter
      getPopupContainer={() => document.body}
    >
      <p className='mt-0 text-12px text-t-secondary'>
        {t('agentTasks.kanban.ownersHint', {
          defaultValue: 'Os nomes abaixo são locais deste quadro. Os assistentes globais não são alterados.',
        })}
      </p>
      <div className='mt-14px max-h-520px space-y-8px overflow-y-auto'>
        {assistants.length === 0 ? (
          <Empty description={t('agentTasks.kanban.noAssistants', { defaultValue: 'Nenhum assistente disponível' })} />
        ) : null}
        {assistants.map((assistant) => {
          const draft = drafts[assistant.id];
          if (!draft) return null;
          return (
            <div
              key={assistant.id}
              className='rounded-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-10px'
            >
              <div className='flex items-center gap-8px'>
                <input
                  type='color'
                  value={draft.color}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [assistant.id]: { ...draft, color: event.target.value } }))
                  }
                  className='size-20px shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0'
                  aria-label={t('agentTasks.kanban.roleColor', { defaultValue: 'Cor do responsável' })}
                />
                <div className='min-w-0 flex-1'>
                  <Input
                    size='small'
                    value={draft.name}
                    onChange={(value) => setDrafts((prev) => ({ ...prev, [assistant.id]: { ...draft, name: value } }))}
                    placeholder={t('agentTasks.kanban.roleName', { defaultValue: 'Nome no quadro' })}
                  />
                  <div className='mt-3px truncate text-11px text-t-tertiary'>
                    {assistant.name} · {assistant.agent?.acp_backend || assistant.agent_id}
                  </div>
                </div>
                <Button
                  size='small'
                  type='primary'
                  loading={saving === assistant.id}
                  onClick={() => void save(assistant.id)}
                >
                  {t('common.save', { defaultValue: 'Salvar' })}
                </Button>
                {draft.roleId ? (
                  <Popconfirm
                    content={t('agentTasks.kanban.removeOwnerConfirm', { defaultValue: 'Remove this local role?' })}
                    onConfirm={() => void onDelete(draft.roleId as string)}
                  >
                    <Button
                      size='small'
                      type='text'
                      status='danger'
                      icon={<Delete size={13} />}
                      aria-label={t('agentTasks.kanban.removeOwner', { defaultValue: 'Remover responsável' })}
                    />
                  </Popconfirm>
                ) : null}
              </div>
              <Input
                className='mt-8px'
                size='small'
                value={draft.responsibility}
                onChange={(value) =>
                  setDrafts((prev) => ({ ...prev, [assistant.id]: { ...draft, responsibility: value } }))
                }
                placeholder={t('agentTasks.kanban.responsibility', { defaultValue: 'Responsabilidade / instruções' })}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

const KanbanPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { assistants } = useAssistantList();
  const enabledAssistants = useMemo(() => selectableAssistants(assistants), [assistants]);
  const tasks: Task[] = [];
  const refreshTasks = () => {};
  const {
    boards,
    loading,
    error,
    hasApi,
    refresh,
    createBoard,
    updateBoard,
    deleteBoard,
    createCard,
    updateCard,
    moveCard,
    dispatchCard: dispatchKanbanCard,
    createRole,
    updateRole,
    deleteRole,
  } = useKanban();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dispatchingCardId, setDispatchingCardId] = useState<string | null>(null);
  const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
  const [dispatchingCard, setDispatchingCard] = useState<KanbanCard | null>(null);
  const [cardEditorVisible, setCardEditorVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  const [roleManagerVisible, setRoleManagerVisible] = useState(false);
  const [boardModalVisible, setBoardModalVisible] = useState(false);
  const [boardDraft, setBoardDraft] = useState({ name: '', description: '' });
  const [renameBoardVisible, setRenameBoardVisible] = useState(false);
  const [renameBoardDraft, setRenameBoardDraft] = useState({ name: '', description: '' });
  const [deleteBoardVisible, setDeleteBoardVisible] = useState(false);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<KanbanBoard | null>(null);
  const [automationVisible, setAutomationVisible] = useState(false);
  const autoMoveRef = useRef(new Set<string>());

  const visibleBoards = useMemo(
    () => boards.filter((board) => showArchived || !board.archived),
    [boards, showArchived]
  );
  const board = useMemo(
    () => visibleBoards.find((item) => item.id === selectedBoardId) ?? visibleBoards[0] ?? null,
    [selectedBoardId, visibleBoards]
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const roleById = useMemo(() => new Map((board?.roles ?? []).map((role) => [role.id, role])), [board?.roles]);
  const assistantNameById = useMemo(() => new Map(assistants.map((item) => [item.id, item.name])), [assistants]);
  const now = useNow();
  const [focus, setFocus] = useState<'all' | 'due_soon' | 'overdue' | 'risk' | 'impact'>('all');
  const onlyOverdue = focus === 'overdue';
  const boardColumns = board?.columns ?? [];
  const atRiskCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (!board) return ids;
    const byId = new Map(board.cards.map((card) => [card.id, card]));
    for (const card of board.cards) {
      if (isCardAtRisk(card, byId, board.columns, now)) ids.add(card.id);
    }
    return ids;
  }, [board, now]);
  const overdueCardIds = useMemo(() => {
    if (!board) return new Set<string>();
    return new Set(
      board.cards
        .filter((card) => !card.archived && deriveScheduleStatus(card, board.columns, now) === 'overdue')
        .map((card) => card.id)
    );
  }, [board, now]);
  const dueSoonCardIds = useMemo(() => {
    if (!board) return new Set<string>();
    return new Set(
      board.cards
        .filter((card) => !card.archived && deriveScheduleStatus(card, board.columns, now) === 'due_soon')
        .map((card) => card.id)
    );
  }, [board, now]);
  const cardsById = useMemo(() => new Map((board?.cards ?? []).map((card) => [card.id, card])), [board?.cards]);
  const impacts = useMemo(() => (board ? rankByImpact(board.cards, board.columns, now) : []), [board, now]);
  const impactCardIds = useMemo(() => new Set(impacts.map((item) => item.card_id)), [impacts]);
  const blockerCount = useMemo(
    () => impacts.filter((item) => item.blocksCount > 0 || item.lateDependencies.length > 0).length,
    [impacts]
  );

  useEffect(() => {
    if (!board && visibleBoards[0]) setSelectedBoardId(visibleBoards[0].id);
    if (board && selectedBoardId !== board.id) setSelectedBoardId(board.id);
  }, [board, selectedBoardId, visibleBoards]);

  useEffect(() => {
    if (!board) return;
    for (const card of board.cards) {
      if (!card.task_id) continue;
      const task = taskById.get(card.task_id);
      if (!task) continue;
      const targetKey =
        task.status === 'running'
          ? 'running'
          : task.status === 'pending'
            ? 'scheduled'
            : task.status === 'completed'
              ? 'review'
              : 'blocked';
      const targetColumn = board.columns.find((column) => column.key === targetKey);
      const marker = `${card.id}:${task.status}`;
      if (!targetColumn || card.column_id === targetColumn.id || autoMoveRef.current.has(marker)) continue;
      autoMoveRef.current.add(marker);
      void moveCard({ id: card.id, column_id: targetColumn.id }).catch((moveError) =>
        console.error('Failed to sync Kanban card status:', moveError)
      );
    }
  }, [board, moveCard, taskById]);

  const openConversation = (task: Task) => {
    if (!task.agent_id) return;
    void navigate(`/conversation/${task.agent_id}`);
  };

  const openNewCard = () => {
    if (!board) return;
    setEditingCard(null);
    setCardEditorVisible(true);
  };

  const openCard = (card: KanbanCard) => {
    setEditingCard(card);
    setCardEditorVisible(true);
  };

  const saveCard = async (input: CreateKanbanCardInput | UpdateKanbanCardInput) => {
    if ('board_id' in input) await createCard(input);
    else await updateCard(input);
    Message.success(t('agentTasks.kanban.saved', { defaultValue: 'Card saved' }));
  };

  const archiveCard = async (card: KanbanCard) => {
    await updateCard({ id: card.id, archived: true });
    setCardEditorVisible(false);
    Message.success(t('agentTasks.kanban.archived', { defaultValue: 'Card archived' }));
  };

  const openDispatch = (card: KanbanCard) => {
    const role = card.role_id ? roleById.get(card.role_id) : undefined;
    if (!role || (!role.assistant_id && !role.team_id)) {
      Message.error(
        t('agentTasks.kanban.assignBeforeDispatch', { defaultValue: 'Assign an owner before dispatching this card.' })
      );
      return;
    }
    setDispatchingCard(card);
    setDispatchModalVisible(true);
  };

  const dispatchCard = async (card: KanbanCard, missionOverride?: string) => {
    const role = card.role_id ? roleById.get(card.role_id) : undefined;
    if (!role || (!role.assistant_id && !role.team_id)) {
      Message.error(
        t('agentTasks.kanban.assignBeforeDispatch', { defaultValue: 'Assign an owner before dispatching this card.' })
      );
      return;
    }
    setDispatchingCardId(card.id);
    try {
      const mission = (missionOverride ?? buildDispatchMission(card, role)).trim();
      if (!mission) {
        Message.error(t('agentTasks.kanban.dispatchEmptyMission', { defaultValue: 'A missão não pode ficar vazia.' }));
        return;
      }
      const runningColumn = board?.columns.find((column) => column.key === 'running');
      const result = await dispatchKanbanCard({
        card_id: card.id,
        mission,
        assistant_id: role.assistant_id,
        team_id: role.team_id,
        workspace: card.workspace,
        column_id: runningColumn?.id ?? card.column_id,
      });
      await refreshTasks();
      Message.success(
        result.reused
          ? t('agentTasks.kanban.alreadyDispatched', { defaultValue: 'Card already has a task' })
          : t('agentTasks.kanban.dispatched', { defaultValue: 'Card dispatched' })
      );
    } catch (dispatchError) {
      Message.error(
        `${t('agentTasks.kanban.dispatchFailed', { defaultValue: 'Dispatch failed' })}: ${dispatchError instanceof Error ? dispatchError.message : String(dispatchError)}`
      );
    } finally {
      setDispatchingCardId(null);
    }
  };

  const saveRole = async (draft: RoleDraft) => {
    if (!board) return;
    if (draft.roleId)
      await updateRole({
        id: draft.roleId,
        name: draft.name,
        assistant_id: draft.assistantId,
        responsibility: draft.responsibility,
        color: draft.color,
      });
    else
      await createRole({
        board_id: board.id,
        name: draft.name,
        assistant_id: draft.assistantId,
        responsibility: draft.responsibility,
        color: draft.color,
      });
    Message.success(t('agentTasks.kanban.ownerSaved', { defaultValue: 'Owner saved' }));
  };

  const removeRole = async (roleId: string) => {
    await deleteRole(roleId);
    Message.success(t('agentTasks.kanban.ownerRemoved', { defaultValue: 'Owner removed' }));
  };

  const dropCard = async (cardId: string, columnId: string) => {
    setDraggedCardId(null);
    try {
      await moveCard({ id: cardId, column_id: columnId });
    } catch (moveError) {
      Message.error(
        `${t('agentTasks.kanban.moveFailed', { defaultValue: 'Could not move card' })}: ${moveError instanceof Error ? moveError.message : String(moveError)}`
      );
    }
  };

  const saveBoard = async () => {
    if (!boardDraft.name.trim()) return;
    const created = await createBoard({ name: boardDraft.name, description: boardDraft.description });
    setSelectedBoardId(created.id);
    setBoardDraft({ name: '', description: '' });
    setBoardModalVisible(false);
  };

  const openRenameBoard = (target: KanbanBoard) => {
    setRenameBoardDraft({ name: target.name, description: target.description });
    setRenameBoardVisible(true);
  };

  const saveRenameBoard = async () => {
    if (!board || !renameBoardDraft.name.trim()) return;
    await updateBoard({ id: board.id, name: renameBoardDraft.name, description: renameBoardDraft.description });
    setRenameBoardVisible(false);
    Message.success(t('agentTasks.kanban.boardRenamed', { defaultValue: 'Board renamed' }));
  };

  const openDeleteBoard = (target: KanbanBoard) => {
    setDeleteBoardTarget(target);
    setDeleteBoardVisible(true);
  };

  const confirmDeleteBoard = async () => {
    if (!deleteBoardTarget) return;
    await deleteBoard(deleteBoardTarget.id);
    setDeleteBoardVisible(false);
    setDeleteBoardTarget(null);
    setSelectedBoardId(null);
    Message.success(t('agentTasks.kanban.boardDeleted', { defaultValue: 'Board deleted' }));
  };

  const applyAutomationPlan = async (plan: KanbanAutomationPlan) => {
    if (!board) return;
    const workingCards = new Map(board.cards.map((card) => [card.id, { ...card }]));
    const orderedActions = [
      ...plan.actions.filter((action) => action.type !== 'dispatch_card'),
      ...plan.actions.filter((action) => action.type === 'dispatch_card'),
    ];
    for (const action of orderedActions) {
      if (action.type === 'create_card') {
        // Apply the approved plan sequentially so later actions see earlier changes.
        // eslint-disable-next-line no-await-in-loop
        const created = await createCard({
          board_id: board.id,
          column_id:
            action.column_id ||
            board.columns.find((column) => column.key === 'triage')?.id ||
            board.columns[0]?.id ||
            '',
          title: action.title,
          description: action.description,
          role_id: action.role_id,
          priority: action.priority,
          workspace: action.workspace,
        });
        workingCards.set(created.id, { ...created, depends_on: [] });
        continue;
      }
      const current = workingCards.get(action.card_id);
      if (!current) throw new Error(`Card ${action.card_id} was not found while applying the plan.`);
      if (action.type === 'move_card') {
        // eslint-disable-next-line no-await-in-loop
        const moved = await moveCard({ id: current.id, column_id: action.column_id });
        workingCards.set(moved.id, { ...moved, depends_on: current.depends_on });
      } else if (action.type === 'assign_card') {
        // eslint-disable-next-line no-await-in-loop
        const updated = await updateCard({ id: current.id, role_id: action.role_id });
        workingCards.set(updated.id, { ...updated, depends_on: current.depends_on });
      } else if (action.type === 'update_card') {
        // eslint-disable-next-line no-await-in-loop
        const updated = await updateCard({
          id: current.id,
          title: action.title,
          description: action.description,
          priority: action.priority,
          role_id: action.role_id,
        });
        workingCards.set(updated.id, { ...updated, depends_on: current.depends_on });
      } else if (action.type === 'archive_card') {
        // eslint-disable-next-line no-await-in-loop
        const archived = await updateCard({ id: current.id, archived: true });
        workingCards.set(archived.id, { ...archived, depends_on: current.depends_on });
      } else if (action.type === 'dispatch_card') {
        const role = current.role_id ? roleById.get(current.role_id) : undefined;
        if (!role || (!role.assistant_id && !role.team_id))
          throw new Error(`Card ${current.title} has no executable owner.`);
        const mission = [
          `Activity: ${current.title}`,
          role.responsibility ? `Owner responsibility: ${role.responsibility}` : '',
          current.description,
        ]
          .filter(Boolean)
          .join('\n\n');
        // eslint-disable-next-line no-await-in-loop
        await dispatchKanbanCard({
          card_id: current.id,
          mission,
          assistant_id: role.assistant_id,
          team_id: role.team_id,
          workspace: current.workspace,
          column_id: board.columns.find((column) => column.key === 'running')?.id,
        });
      }
    }
    await refreshTasks();
    await refresh();
    Message.success(t('agentTasks.kanban.managerApplied', { defaultValue: 'Board plan applied' }));
  };

  const archiveBoard = async (target: KanbanBoard | null = board) => {
    if (!target) return;
    await updateBoard({ id: target.id, archived: true });
    if (target.id === selectedBoardId) setSelectedBoardId(null);
  };

  const restoreBoard = async (target: KanbanBoard | null = board) => {
    if (!target) return;
    await updateBoard({ id: target.id, archived: false });
  };

  if (!hasApi)
    return (
      <div className='flex h-full items-center justify-center'>
        <Empty
          description={t('agentTasks.kanban.unavailable', { defaultValue: 'Kanban is unavailable in this runtime' })}
        />
      </div>
    );

  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden bg-1'>
      <header className='shrink-0 border-b border-solid border-[var(--color-border-2)] px-16px py-14px md:px-32px'>
        <div className='flex flex-wrap items-center justify-between gap-12px'>
          <div>
            <h1 className='m-0 text-24px font-semibold text-t-primary'>
              {t('agentTasks.kanban.title', { defaultValue: 'Kanban' })}
            </h1>
            <p className='mt-4px text-12px text-t-secondary'>
              {t('agentTasks.kanban.description', {
                defaultValue: 'Organize activities and assign them to existing agents.',
              })}
            </p>
          </div>
          <div className='flex items-center gap-8px'>
            <Button icon={<Refresh size={14} />} onClick={() => void refresh()} loading={loading}>
              {t('common.refresh', { defaultValue: 'Atualizar' })}
            </Button>
            <Button icon={<Edit size={14} />} onClick={() => setRoleManagerVisible(true)}>
              {t('agentTasks.kanban.owners', { defaultValue: 'Responsáveis' })}
            </Button>
            <Button icon={<Robot size={14} />} onClick={() => setAutomationVisible(true)} disabled={!board}>
              {t('agentTasks.kanban.managerTitle', { defaultValue: 'Agente do board' })}
            </Button>
            <Button type='primary' icon={<Plus size={14} />} onClick={openNewCard}>
              {t('agentTasks.kanban.newCard', { defaultValue: 'Novo card' })}
            </Button>
          </div>
        </div>
        <div className='mt-16px flex items-center gap-8px overflow-x-auto pb-2px'>
          {visibleBoards.map((item) => (
            <div
              key={item.id}
              className='flex shrink-0 items-center rounded-full border border-solid shadow-sm transition-colors'
              style={
                item.id === board?.id
                  ? { background: 'color-mix(in srgb, var(--primary) 22%, var(--bg-2))', borderColor: 'var(--primary)' }
                  : { background: 'var(--bg-2)', borderColor: 'var(--border-base)' }
              }
            >
              <button
                type='button'
                onClick={() => setSelectedBoardId(item.id)}
                title={item.name}
                className='rounded-full px-12px py-6px text-12px font-medium transition-colors !bg-transparent hover:!bg-[var(--bg-hover)]'
                style={{ color: 'var(--text-primary)' }}
              >
                {item.name}{' '}
                <span
                  className='ms-4px'
                  style={{ color: item.id === board?.id ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {item.cards.filter((card) => !card.archived).length}
                </span>
              </button>
              <Dropdown
                trigger='click'
                position='br'
                getPopupContainer={() => document.body}
                droplist={
                  <Menu
                    onClickMenuItem={(key) => {
                      if (key === 'rename') openRenameBoard(item);
                      if (key === 'archive') void archiveBoard(item);
                      if (key === 'restore') void restoreBoard(item);
                      if (key === 'delete') openDeleteBoard(item);
                    }}
                  >
                    <Menu.Item key='rename'>
                      {t('agentTasks.kanban.renameBoard', { defaultValue: 'Renomear board' })}
                    </Menu.Item>
                    {item.archived ? (
                      <Menu.Item key='restore'>
                        {t('agentTasks.kanban.restoreBoard', { defaultValue: 'Restaurar board' })}
                      </Menu.Item>
                    ) : (
                      <Menu.Item key='archive'>
                        {t('agentTasks.kanban.archiveBoard', { defaultValue: 'Arquivar board' })}
                      </Menu.Item>
                    )}
                    <Menu.Item key='delete' className='text-danger-6'>
                      {t('agentTasks.kanban.deleteBoard', { defaultValue: 'Excluir board' })}
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button
                  type='text'
                  size='mini'
                  icon={<MoreOne size={14} />}
                  aria-label={t('agentTasks.kanban.boardActions', { defaultValue: 'Ações do board' })}
                  className='hover:bg-[var(--bg-hover)]'
                  style={{ color: item.id === board?.id ? 'var(--primary)' : 'var(--text-secondary)' }}
                  onClick={(event) => event.stopPropagation()}
                />
              </Dropdown>
            </div>
          ))}
          <Button type='text' size='small' icon={<Plus size={13} />} onClick={() => setBoardModalVisible(true)}>
            {t('agentTasks.kanban.newBoard', { defaultValue: 'Novo board' })}
          </Button>
          <Radio.Group
            type='button'
            size='small'
            className='ms-auto shrink-0'
            value={focus}
            onChange={(value) => setFocus(value as 'all' | 'due_soon' | 'overdue' | 'risk' | 'impact')}
          >
            <Radio value='all'>{t('agentTasks.kanban.filterAll', { defaultValue: 'Todos' })}</Radio>
            <Radio value='due_soon'>
              {t('agentTasks.kanban.onlyDueSoon', { defaultValue: 'A vencer' })} ({dueSoonCardIds.size})
            </Radio>
            <Radio value='overdue'>
              {t('agentTasks.kanban.onlyOverdue', { defaultValue: 'Atrasados' })} ({overdueCardIds.size})
            </Radio>
            <Radio value='impact'>
              {t('agentTasks.kanban.onlyImpact', { defaultValue: 'Travando' })} ({impactCardIds.size})
            </Radio>
            <Radio value='risk'>
              {t('agentTasks.kanban.onlyAtRisk', { defaultValue: 'Em risco' })} ({atRiskCardIds.size})
            </Radio>
          </Radio.Group>
          <Checkbox checked={showArchived} onChange={setShowArchived} className='shrink-0'>
            {t('agentTasks.kanban.showArchived', { defaultValue: 'Mostrar arquivados' })}
          </Checkbox>
        </div>
      </header>

      {error ? (
        <div className='m-16px rounded-8px border border-danger-2 bg-danger-1 px-12px py-8px text-12px text-danger-6'>
          {error}
        </div>
      ) : null}
      {loading && boards.length === 0 ? (
        <div className='flex flex-1 items-center justify-center'>
          <Spin />
        </div>
      ) : null}
      {!loading && visibleBoards.length === 0 ? (
        <div className='flex flex-1 flex-col items-center justify-center gap-10px'>
          <Empty description={t('agentTasks.kanban.noActiveBoards', { defaultValue: 'No active boards' })} />
          {boards.some((item) => item.archived) ? (
            <Button onClick={() => setShowArchived(true)}>
              {t('agentTasks.kanban.showArchived', { defaultValue: 'Mostrar arquivados' })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {board ? (
        <div className='min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-16px md:overflow-x-auto md:overflow-y-hidden md:p-24px'>
          <div className='flex flex-col gap-12px md:h-full md:min-w-max md:flex-row'>
            {board.columns.map((column) => {
              if (column.key === DECISIONS_COLUMN_KEY) {
                return (
                  <section
                    key={column.id}
                    className='flex w-full shrink-0 flex-col self-start rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] md:w-280px'
                  >
                    <div className='flex items-center gap-8px px-12px pt-10px pb-4px'>
                      <span className='text-13px font-semibold text-t-primary'>
                        {column.name || t('agentTasks.kanban.panelTitle', { defaultValue: 'Decisões' })}
                      </span>
                      <span className='rounded-full bg-[var(--color-fill-3)] px-7px py-2px text-11px text-t-secondary'>
                        {blockerCount}
                      </span>
                    </div>
                    <div className='px-6px pb-8px'>
                      <DecisionPanel
                        impacts={impacts}
                        cardsById={cardsById}
                        t={t}
                        onOpenCard={(cardId) => {
                          const card = cardsById.get(cardId);
                          if (card) openCard(card);
                        }}
                      />
                    </div>
                  </section>
                );
              }
              const cards = board.cards.filter(
                (card) =>
                  card.column_id === column.id &&
                  (showArchived || !card.archived) &&
                  (focus === 'all' ||
                    (focus === 'due_soon' && dueSoonCardIds.has(card.id)) ||
                    (focus === 'overdue' && overdueCardIds.has(card.id)) ||
                    (focus === 'impact' && impactCardIds.has(card.id)) ||
                    (focus === 'risk' && atRiskCardIds.has(card.id)))
              );
              return (
                <KanbanColumnView
                  key={column.id}
                  column={column}
                  cards={cards}
                  columns={boardColumns}
                  now={now}
                  atRiskIds={atRiskCardIds}
                  roleById={roleById}
                  taskById={taskById}
                  t={t}
                  onDropCard={(cardId, columnId) => void dropCard(cardId, columnId)}
                  onOpenCard={openCard}
                  onOpenConversation={openConversation}
                  onDispatchCard={openDispatch}
                  onArchiveCard={(card) => void archiveCard(card)}
                  onDragStart={setDraggedCardId}
                  onDragEnd={() => setDraggedCardId(null)}
                  draggedCardId={draggedCardId}
                  onReceipt={(card, patch) => void updateCard(patch)}
                  dispatchingCardId={dispatchingCardId}
                />
              );
            })}
          </div>
        </div>
      ) : null}
      {draggedCardId ? <span className='sr-only'>{draggedCardId}</span> : null}

      {board ? (
        <>
          <CardEditorModal
            visible={cardEditorVisible}
            card={editingCard}
            board={board}
            roles={board.roles}
            t={t}
            onClose={() => setCardEditorVisible(false)}
            onSave={saveCard}
            onArchive={archiveCard}
          />
          <DispatchCardModal
            visible={dispatchModalVisible}
            card={dispatchingCard}
            role={dispatchingCard?.role_id ? roleById.get(dispatchingCard.role_id) : undefined}
            assistantName={assistantNameById.get(
              dispatchingCard?.role_id ? (roleById.get(dispatchingCard.role_id)?.assistant_id ?? '') : ''
            )}
            t={t}
            sending={dispatchingCardId !== null}
            onClose={() => setDispatchModalVisible(false)}
            onConfirm={async (mission) => {
              if (!dispatchingCard) return;
              await dispatchCard(dispatchingCard, mission);
              setDispatchModalVisible(false);
            }}
          />
          <RoleManagerModal
            visible={roleManagerVisible}
            board={board}
            assistants={enabledAssistants}
            t={t}
            onClose={() => setRoleManagerVisible(false)}
            onSave={saveRole}
            onDelete={removeRole}
          />
        </>
      ) : null}

      <Modal
        visible={renameBoardVisible}
        title={t('agentTasks.kanban.renameBoard', { defaultValue: 'Renomear board' })}
        onCancel={() => setRenameBoardVisible(false)}
        onOk={() => void saveRenameBoard()}
        okButtonProps={{ disabled: !renameBoardDraft.name.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='space-y-12px'>
          <Input
            autoFocus
            value={renameBoardDraft.name}
            onChange={(name) => setRenameBoardDraft((prev) => ({ ...prev, name }))}
            placeholder={t('agentTasks.kanban.boardName', { defaultValue: 'Nome do board' })}
          />
          <Input.TextArea
            value={renameBoardDraft.description}
            onChange={(description) => setRenameBoardDraft((prev) => ({ ...prev, description }))}
            placeholder={t('agentTasks.kanban.boardDescription', { defaultValue: 'Descrição opcional' })}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </div>
      </Modal>

      <Modal
        visible={deleteBoardVisible}
        title={t('agentTasks.kanban.deleteBoard', { defaultValue: 'Excluir board' })}
        onCancel={() => setDeleteBoardVisible(false)}
        onOk={() => void confirmDeleteBoard()}
        okText={t('agentTasks.kanban.deleteBoard', { defaultValue: 'Excluir board' })}
        okButtonProps={{ status: 'danger' }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <p className='m-0 text-13px leading-20px text-t-primary'>
          {t('agentTasks.kanban.deleteBoardConfirm', {
            name: deleteBoardTarget?.name || '',
            defaultValue:
              'This will permanently delete the board, its cards and its local roles. Tasks and conversations already created will be preserved.',
          })}
        </p>
      </Modal>

      {board ? (
        <BoardAutomationModal
          visible={automationVisible}
          board={board}
          roles={board.roles}
          onClose={() => setAutomationVisible(false)}
          onUpdateBoard={updateBoard}
          onApplyPlan={applyAutomationPlan}
        />
      ) : null}

      <Modal
        visible={boardModalVisible}
        title={t('agentTasks.kanban.newBoard', { defaultValue: 'Novo board' })}
        onCancel={() => setBoardModalVisible(false)}
        onOk={() => void saveBoard()}
        okButtonProps={{ disabled: !boardDraft.name.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='space-y-12px'>
          <Input
            autoFocus
            value={boardDraft.name}
            onChange={(name) => setBoardDraft((prev) => ({ ...prev, name }))}
            placeholder={t('agentTasks.kanban.boardName', { defaultValue: 'Nome do board' })}
          />
          <Input.TextArea
            value={boardDraft.description}
            onChange={(description) => setBoardDraft((prev) => ({ ...prev, description }))}
            placeholder={t('agentTasks.kanban.boardDescription', { defaultValue: 'Descrição opcional' })}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default KanbanPage;
