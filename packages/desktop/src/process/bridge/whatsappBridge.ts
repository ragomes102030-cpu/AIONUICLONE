/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop IPC bridge for the WhatsApp station (read-only status snapshot).
 *
 * The station lives on the user's machine: a Chrome profile logged into
 * WhatsApp Web, started with --remote-debugging-port, plus the
 * `whatsapp-automation` skill and the two summary tasks. The app never
 * installs anything by itself — it only reports whether the station is
 * healthy and which part is missing.
 *
 * The probe runs in the main process because it needs `fetch` (no CORS on
 * the DevTools endpoint) and `fs.existsSync` (to spot skills whose path
 * points to a folder that no longer exists).
 *
 * Scope is GLOBAL: nothing here is bound to a phone number or to a single
 * chat. The probe reports which account is currently connected and how many
 * conversations the station can see.
 */

import { ipcBridge } from '@/common';
import type { IWhatsAppStationStatus, IWhatsAppTask } from '@/common/adapter/ipcBridge';
import fs from 'node:fs';

const CDP_PORT = 9222;
const SKILL_NAME = 'whatsapp-automation';
const TASK_NAME_PATTERN = /whatsapp/i;

interface ChromeTarget {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface ChromeVersion {
  Browser?: string;
  'Protocol-Version'?: string;
}

interface SkillListItem {
  name: string;
  description?: string;
  location: string;
  source?: unknown;
}

interface CronJobResponse {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule?: { kind?: string; expr?: string; tz?: string; description?: string };
  state?: {
    next_run_at_ms?: number;
    last_run_at_ms?: number;
    last_status?: string;
  };
}

function getBackendPort(): number | undefined {
  return (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
}

async function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function backendGet<T>(path: string): Promise<T | null> {
  const port = getBackendPort();
  if (!port) return null;
  const json = await fetchJson<{ data?: T } & T>(`http://127.0.0.1:${port}${path}`);
  if (json === null) return null;
  const payload = (json as { data?: unknown }).data;
  return (payload === undefined ? json : payload) as T;
}

/* ---------------------------------------------------------- expressoes do DOM */

const EXPRESSAO_PAGINA = `(() => {
  const header = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
  const chat = header ? (header.getAttribute('title') || header.textContent || '').trim() : '';
  const pane = document.querySelector('[data-testid="pane-side"], #pane-side');
  const search = document.querySelector('[data-testid="search"], [data-testid="search-input"]');
  const qr = document.querySelector('canvas');
  return JSON.stringify({
    chat,
    loggedIn: Boolean(pane || search || chat),
    qrVisible: Boolean(qr)
  });
})()`;

const EXPRESSAO_CONTA = `(async () => {
  const nomeAtual = () => {
    const d = document.querySelector('[data-testid="drawer-title-body"]');
    return d ? (d.textContent || '').trim() : '';
  };
  const botaoPorRotulo = (padrao) => Array.from(document.querySelectorAll('button,[role="button"]')).find((b) => {
    const rotulo = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
    return padrao.test(rotulo);
  });
  const clicar = (el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  };

  let nome = nomeAtual();
  if (nome) return JSON.stringify({ nome });

  const avatar = document.querySelector('button[aria-label="Você"] img, button[aria-label="Voce"] img');
  const identificador = avatar ? (avatar.getAttribute('src') || '').split('/').pop() || '' : '';

  const abrir = botaoPorRotulo(/^voc(e|ê)$/i);
  if (!abrir) return JSON.stringify({ nome: '', identificador });
  clicar(abrir);
  await new Promise((r) => setTimeout(r, 1300));
  nome = nomeAtual();
  const voltar = botaoPorRotulo(/conversas|chats/i);
  clicar(voltar);
  await new Promise((r) => setTimeout(r, 700));
  return JSON.stringify({ nome, identificador });
})()`;

const EXPRESSAO_LISTA = `(() => {
  const linhas = Array.from(document.querySelectorAll('[role="row"][data-testid^="list-item-"]'));
  let naoLidas = 0;
  for (const linha of linhas) {
    const badge = linha.querySelector('[data-testid="icon-unread-count"]');
    const n = parseInt((badge && badge.textContent ? badge.textContent : '').replace(/\\D+/g, ''), 10);
    if (!Number.isNaN(n)) naoLidas += n;
  }
  return JSON.stringify({ conversas: linhas.length, naoLidas });
})()`;

/* ------------------------------------------------------------------ CDP probe */

/**
 * Evaluate an expression inside the WhatsApp tab and return the parsed JSON.
 * Returns null when the DevTools WebSocket is unavailable (older Electron).
 */
async function evaluateInTab<T>(
  target: ChromeTarget,
  expression: string,
  options: { awaitPromise?: boolean; timeoutMs?: number } = {}
): Promise<T | null> {
  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) return null;
  const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WebSocketCtor) return null;

  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    try {
      socket = new WebSocketCtor(wsUrl);
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => finish(null), options.timeoutMs ?? 6000);
    socket.addEventListener('open', () => {
      socket?.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: Boolean(options.awaitPromise) },
        })
      );
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          result?: { result?: { value?: string } };
        };
        const value = payload?.result?.result?.value;
        if (typeof value !== 'string') return;
        clearTimeout(timer);
        finish(JSON.parse(value) as T);
      } catch {
        /* keep waiting */
      }
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    socket.addEventListener('close', () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

interface PageDetail {
  chat?: string;
  loggedIn?: boolean;
  qrVisible?: boolean;
}

interface AccountDetail {
  nome?: string;
  identificador?: string;
}

interface ListDetail {
  conversas?: number;
  naoLidas?: number;
}

async function inspectChrome(): Promise<IWhatsAppStationStatus['chrome']> {
  const empty = { connected: false, tabs: 0, whatsappTab: false, sessionActive: false };
  const version = await fetchJson<ChromeVersion>(`http://127.0.0.1:${CDP_PORT}/json/version`);
  if (!version) {
    return { ...empty, error: `Chrome nao esta em modo de depuracao (porta ${CDP_PORT})` };
  }
  const targets = (await fetchJson<ChromeTarget[]>(`http://127.0.0.1:${CDP_PORT}/json/list`)) || [];
  const pages = targets.filter((t) => t.type === 'page');
  const whatsappTarget = pages.find((t) => (t.url || '').includes('web.whatsapp.com'));

  if (!whatsappTarget) {
    return {
      connected: true,
      version: version.Browser,
      tabs: pages.length,
      whatsappTab: false,
      sessionActive: false,
      error: 'Nenhuma aba do WhatsApp Web aberta no Chrome de depuracao',
    };
  }

  const title = whatsappTarget.title || '';
  const detail = await evaluateInTab<PageDetail>(whatsappTarget, EXPRESSAO_PAGINA);
  const sessionActive = detail?.loggedIn ?? /\(\d+\)\s*WhatsApp/.test(title);

  const account = sessionActive ? await evaluateInTab<AccountDetail>(whatsappTarget, EXPRESSAO_CONTA, { awaitPromise: true }) : null;
  const list = sessionActive ? await evaluateInTab<ListDetail>(whatsappTarget, EXPRESSAO_LISTA) : null;

  return {
    connected: true,
    version: version.Browser,
    tabs: pages.length,
    whatsappTab: true,
    sessionActive,
    openChat: detail?.chat || undefined,
    conta: account?.nome || undefined,
    identificadorConta: account?.identificador || undefined,
    conversas: list?.conversas,
    naoLidas: list?.naoLidas,
    error: sessionActive ? undefined : 'A sessao do WhatsApp Web nao esta conectada (escaneie o QR no Chrome)',
  };
}

async function inspectSkills(): Promise<{
  skill: IWhatsAppStationStatus['skill'];
  catalog: IWhatsAppStationStatus['catalog'];
}> {
  const items = await backendGet<SkillListItem[]>('/api/skills');
  if (!items) {
    return {
      skill: { installed: false, registered: false },
      catalog: { total: 0, broken: 0 },
    };
  }
  const mine = items.find((s) => s.name === SKILL_NAME);
  let broken = 0;
  for (const item of items) {
    try {
      if (item.location && !fs.existsSync(item.location)) broken += 1;
    } catch {
      broken += 1;
    }
  }
  return {
    skill: {
      installed: Boolean(mine?.location && fs.existsSync(mine.location)),
      path: mine?.location,
      registered: Boolean(mine),
    },
    catalog: { total: items.length, broken },
  };
}

async function inspectTasks(): Promise<IWhatsAppTask[]> {
  const jobs = await backendGet<CronJobResponse[]>('/api/cron/jobs');
  if (!jobs || !Array.isArray(jobs)) return [];
  return jobs
    .filter((job) => TASK_NAME_PATTERN.test(job.name || ''))
    .map((job) => ({
      id: job.id,
      name: job.name,
      expr: job.schedule?.expr || job.schedule?.description || '',
      description: job.description || job.schedule?.description,
      enabled: Boolean(job.enabled),
      nextRunAtMs: job.state?.next_run_at_ms,
      lastRunAtMs: job.state?.last_run_at_ms,
      lastStatus: job.state?.last_status,
    }));
}

export function initWhatsappBridge(): void {
  ipcBridge.whatsapp.getStationStatus.provider(async () => {
    const [chrome, skillInfo, tasks] = await Promise.all([inspectChrome(), inspectSkills(), inspectTasks()]);

    const issues: string[] = [];
    if (!chrome.connected) {
      issues.push('Chrome nao esta em modo de depuracao — rode o instalador da estacao para iniciar o Chrome');
    } else if (!chrome.whatsappTab) {
      issues.push('Abra o WhatsApp Web no Chrome de depuracao');
    } else if (!chrome.sessionActive) {
      issues.push('Sessao do WhatsApp Web expirada — escaneie o QR novamente');
    }
    if (chrome.sessionActive && !chrome.conta) {
      issues.push('Nao foi possivel identificar a conta conectada — reabra o WhatsApp Web no Chrome de depuracao');
    }
    if (skillInfo.skill.installed === false) {
      issues.push(`A skill ${SKILL_NAME} nao esta instalada — rode "npm run station:whatsapp"`);
    } else if (!skillInfo.skill.registered) {
      issues.push(`A skill ${SKILL_NAME} nao esta registrada no catalogo — rode "npm run station:whatsapp"`);
    }
    if (skillInfo.catalog.broken > 0) {
      issues.push(`${skillInfo.catalog.broken} skill(s) do catalogo apontam para pastas inexistentes`);
    }
    if (tasks.length === 0) {
      issues.push('Nenhuma tarefa de resumo cadastrada — rode "npm run station:whatsapp"');
    }

    return {
      chrome,
      skill: skillInfo.skill,
      catalog: skillInfo.catalog,
      tasks,
      issues,
      checkedAt: Date.now(),
    };
  });
}
