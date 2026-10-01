/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { HostRouteHandler } from '@aionui/web-host';

import {
  listKanbanBoards,
  moveKanbanCard,
  updateKanbanCard,
  ensureKanbanSchema,
  type KanbanDatabase,
} from './kanbanRepository';
import { ensureTaskSchema } from './taskRepository';

const PREFIX = '/api/kanban';
/** A card payload is small; anything larger is a client bug, not a real request. */
const MAX_BODY_BYTES = 1024 * 1024;

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
};

/**
 * Serves the Kanban to WebUI clients (a phone on the LAN/Tailscale).
 *
 * Why this exists: the board lives in `tasks.db`, opened by the desktop process,
 * and NOT in aioncore. The renderer reaches it over IPC on the desktop, but the
 * browser has no preload and falls back to `/api/kanban/*` — which the WebUI
 * reverse-proxy sent to the backend, where the route does not exist. The field
 * got `404 NOT_FOUND` and an empty board.
 *
 * So the desktop hands this handler to web-host, which asks it before proxying.
 * The board logic is the same repository the desktop uses: no second
 * implementation, no second schema.
 *
 * Only the three operations the browser client exposes are served. Creating and
 * deleting boards, roles and columns stays on the desktop: those change the
 * project's structure and belong to whoever is setting the board up, not to
 * someone checking a service from the field.
 */
export function createKanbanHostRoutes(resolveDb: () => KanbanDatabase): HostRouteHandler {
  return async (req, res) => {
    const url = req.url ?? '';
    if (!url.startsWith(PREFIX)) return false;

    // Strip the query string: the list call carries ?include_archived=true.
    const route = url.slice(PREFIX.length).split('?')[0];
    const method = req.method ?? 'GET';

    try {
      const db = resolveDb();

      if (route === '/board' && method === 'GET') {
        const includeArchived = /[?&]include_archived=true/.test(url);
        sendJson(res, 200, { data: listKanbanBoards(db, { include_archived: includeArchived }) });
        return true;
      }

      if (route === '/card' && method === 'PATCH') {
        const input = JSON.parse((await readBody(req)) || '{}');
        sendJson(res, 200, { data: updateKanbanCard(db, input) });
        return true;
      }

      if (route === '/card/move' && method === 'PATCH') {
        const input = JSON.parse((await readBody(req)) || '{}');
        sendJson(res, 200, { data: moveKanbanCard(db, input) });
        return true;
      }

      sendJson(res, 404, {
        success: false,
        error: `Kanban route not available over WebUI: ${method} ${route}`,
        code: 'NOT_FOUND',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Kanban] WebUI request failed:', message);
      sendJson(res, 400, { success: false, error: message, code: 'KANBAN_REQUEST_FAILED' });
      return true;
    }
  };
}

/**
 * Opens `tasks.db` once and keeps the handle for the life of the process.
 *
 * A second connection to the same SQLite file is safe (WAL), and the schema
 * helpers are idempotent, so this can run next to the one the task service holds.
 */
export function createKanbanDbProvider(dataDir: string): () => KanbanDatabase {
  let db: KanbanDatabase | null = null;
  return () => {
    if (!db) {
      db = new Database(path.join(dataDir, 'tasks.db'));
      ensureTaskSchema(db);
      ensureKanbanSchema(db);
    }
    return db;
  };
}
