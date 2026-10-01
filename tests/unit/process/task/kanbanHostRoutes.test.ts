/**
 * The Kanban over WebUI: the phone got `404 NOT_FOUND` because `/api/kanban/*`
 * was proxied to aioncore, which does not own the board.
 *
 * These tests drive the injected handler directly with stand-in req/res objects,
 * so the routing, the JSON envelope and the failure paths are exercised without
 * standing up a server or a backend.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKanbanHostRoutes } from '@process/task/kanbanHostRoutes';
import {
  createKanbanCard,
  ensureKanbanSchema,
  listKanbanBoards,
  type KanbanDatabase,
} from '@process/task/kanbanRepository';
import { ensureTaskSchema } from '@process/task/taskRepository';

type Captured = { status: number; body: string };

const fakeReq = (url: string, method: string, body = ''): IncomingMessage => {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const req = {
    url,
    method,
    on(event: string, cb: (arg?: unknown) => void) {
      (listeners[event] ||= []).push(cb);
      return req;
    },
  } as unknown as IncomingMessage;
  // Emit synchronously, right after the handlers are attached.
  queueMicrotask(() => {
    if (listeners.data) listeners.data.forEach((cb) => cb(Buffer.from(body, 'utf8')));
    if (listeners.end) listeners.end.forEach((cb) => cb());
  });
  return req;
};

const fakeRes = (): { res: ServerResponse; captured: Captured } => {
  const captured: Captured = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(body?: string) {
      captured.body = body ?? '';
      return res;
    },
  } as unknown as ServerResponse;
  return { res, captured };
};

const dir = mkdtempSync(path.join(tmpdir(), 'kanban-host-'));
let db: KanbanDatabase;
let handler: ReturnType<typeof createKanbanHostRoutes>;
let cardId: string;

async function call(url: string, method = 'GET', body?: unknown) {
  const { res, captured } = fakeRes();
  const handled = await handler(
    fakeReq(url, method, body === undefined ? '' : JSON.stringify(body)),
    res
  );
  return { handled, status: captured.status, payload: captured.body ? JSON.parse(captured.body) : null };
}

describe('rotas do Kanban servidas pelo desktop para o WebUI', () => {
  beforeAll(() => {
    db = new BetterSqlite3(path.join(dir, 'tasks.db'));
    ensureTaskSchema(db);
    ensureKanbanSchema(db);
    const board = listKanbanBoards(db)[0];
    cardId = createKanbanCard(db, {
      board_id: board.id,
      column_id: board.columns.find((c) => c.key === 'scheduled')!.id,
      title: 'Estrutura - pilares',
      assignee: 'Sousa',
      scheduled_for: 1_700_000_000_000,
    }).id;
    handler = createKanbanHostRoutes(() => db);
  });

  afterAll(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('1. devolve o quadro em GET /api/kanban/board', async () => {
    const { handled, status, payload } = await call('/api/kanban/board');

    expect(handled).toBe(true);
    expect(status).toBe(200);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data[0].cards.map((c: { title: string }) => c.title)).toContain('Estrutura - pilares');
  });

  it('2. respeita include_archived da consulta', async () => {
    const semArquivados = await call('/api/kanban/board');
    const comArquivados = await call('/api/kanban/board?include_archived=true');

    expect(comArquivados.status).toBe(200);
    expect(comArquivados.payload.data.length).toBeGreaterThanOrEqual(semArquivados.payload.data.length);
  });

  it('3. atualiza o cartao em PATCH /api/kanban/card', async () => {
    const { status, payload } = await call('/api/kanban/card', 'PATCH', {
      id: cardId,
      assignee: 'Lima',
      start_for: 1_700_000_500_000,
    });

    expect(status).toBe(200);
    expect(payload.data.assignee).toBe('Lima');
    expect(payload.data.start_for).toBe(1_700_000_500_000);

    // And it really persisted, not just echoed back.
    expect(listKanbanBoards(db)[0].cards.find((c) => c.id === cardId)!.assignee).toBe('Lima');
  });

  it('4. move o cartao em PATCH /api/kanban/card/move', async () => {
    const done = listKanbanBoards(db)[0].columns.find((c) => c.key === 'done')!.id;

    const { status, payload } = await call('/api/kanban/card/move', 'PATCH', {
      id: cardId,
      column_id: done,
      position: 0,
    });

    expect(status).toBe(200);
    expect(payload.data.column_id).toBe(done);
    expect(listKanbanBoards(db)[0].cards.find((c) => c.id === cardId)!.column_id).toBe(done);
  });

  it('5. ignora o que nao e do Kanban, para o proxy assumir', async () => {
    expect((await call('/api/providers')).handled).toBe(false);
    expect((await call('/api/mcp/servers')).handled).toBe(false);
  });

  it('6. recusa rota do Kanban que nao existe, sem passar 500', async () => {
    const { handled, status, payload } = await call('/api/kanban/board', 'DELETE');

    expect(handled).toBe(true);
    expect(status).toBe(404);
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('NOT_FOUND');
  });

  it('7. corpo invalido vira 400 legivel e nao derruba o servidor', async () => {
    const { res, captured } = fakeRes();
    const handled = await handler(fakeReq('/api/kanban/card', 'PATCH', '{not json'), res);

    expect(handled).toBe(true);
    expect(captured.status).toBe(400);
    expect(JSON.parse(captured.body).success).toBe(false);
  });

  it('8. cartao inexistente responde 400 legivel', async () => {
    const { status, payload } = await call('/api/kanban/card', 'PATCH', { id: 'card-nao-existe' });

    expect(status).toBe(400);
    expect(payload.error).toContain('not found');
  });

  it('9. criar board continua fora do WebUI', async () => {
    // Deliberately not served: restructuring the board is a desktop action.
    const { status, payload } = await call('/api/kanban/board', 'POST', { name: 'novo' });

    expect(status).toBe(404);
    expect(payload.error).toContain('not available over WebUI');
  });
});
