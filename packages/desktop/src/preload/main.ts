/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Hook Sentry IPC so the renderer SDK uses ipcRenderer.send instead of falling
// back to fetch('sentry-ipc://...'), which floods the DevTools Network panel.
// Bundled into this preload via `externalizeDepsPlugin({ exclude: [...] })` so
// Electron's sandbox-mode preload doesn't try to resolve it from node_modules.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ADAPTER_BRIDGE_EVENT_KEY } from '../common/adapter/constant';
import type { KanbanAPI } from '../common/kanban/kanbanTypes';

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: unknown) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },
  on: (callback: (payload: { event: unknown; value: unknown }) => void) => {
    const handler = (event: unknown, value: unknown) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Feedback: collect and compress recent log files
  collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs'),
  // Feedback: capture a screenshot of the current window
  captureFeedbackScreenshot: () => ipcRenderer.invoke('feedback:capture-screenshot'),
  // Feedback: forward diagnostics logs to the main process console
  logFeedbackEvent: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) =>
    ipcRenderer.send('feedback:renderer-log', payload),
  recoverCorruptedDatabase: () => ipcRenderer.invoke('backend:recover-corrupted-database'),
});

// Task bridge — kept for Kanban card dispatch (BoardAutomationModal).
// The main process starts the task service once aioncore is ready; this
// context bridge only forwards the thin IPC surface used by the renderer.
contextBridge.exposeInMainWorld('taskAPI', {
  create: (mission: string, options?: { assistant_id?: string; team_id?: string; workspace?: string }) =>
    ipcRenderer.invoke('task:create', { mission, ...options }),
  list: (options?: { status?: string; limit?: number; offset?: number }) => ipcRenderer.invoke('task:list', options),
  get: (id: string) => ipcRenderer.invoke('task:get', id),
  cancel: (id: string) => ipcRenderer.invoke('task:cancel', id),
  remove: (id: string) => ipcRenderer.invoke('task:delete', id),
});

// Activity Kanban bridge. Board/card metadata is persisted in the same local
// SQLite file as tasks; task execution remains owned by taskAPI/taskRunner.
const kanbanAPI: KanbanAPI = {
  list: (options) => ipcRenderer.invoke('kanban:list', options),
  createBoard: (input) => ipcRenderer.invoke('kanban:board:create', input),
  updateBoard: (input) => ipcRenderer.invoke('kanban:board:update', input),
  deleteBoard: (input) => ipcRenderer.invoke('kanban:board:delete', input.id),
  createRole: (input) => ipcRenderer.invoke('kanban:role:create', input),
  updateRole: (input) => ipcRenderer.invoke('kanban:role:update', input),
  deleteRole: (input) => ipcRenderer.invoke('kanban:role:delete', input.id),
  createCard: (input) => ipcRenderer.invoke('kanban:card:create', input),
  updateCard: (input) => ipcRenderer.invoke('kanban:card:update', input),
  moveCard: (input) => ipcRenderer.invoke('kanban:card:move', input),
  dispatchCard: (input) => ipcRenderer.invoke('kanban:card:dispatch', input),
  createColumn: (input) => ipcRenderer.invoke('kanban:column:create', input),
  updateColumn: (input) => ipcRenderer.invoke('kanban:column:update', input),
  deleteColumn: (input) => ipcRenderer.invoke('kanban:column:delete', input.id),
};
contextBridge.exposeInMainWorld('kanbanAPI', kanbanAPI);

// Synchronously fetch the aioncore port and expose it to the renderer
// via contextBridge (direct window assignment is invisible under contextIsolation).
const backendPort = ipcRenderer.sendSync('get-backend-port') as number;
const initialLanguage = ipcRenderer.sendSync('get-initial-language') as string | null;
const backendStartupFailed = ipcRenderer.sendSync('get-backend-startup-failed') as boolean;
const backendStartupFailure = ipcRenderer.sendSync('get-backend-startup-failure') as unknown;
contextBridge.exposeInMainWorld('__backendPort', backendPort > 0 ? backendPort : 0);
contextBridge.exposeInMainWorld('__initialLanguage', initialLanguage ?? null);
contextBridge.exposeInMainWorld('__aionuiE2ETest', process.env.AIONUI_E2E_TEST === '1');
contextBridge.exposeInMainWorld('__backendStartupFailed', backendStartupFailed === true);
contextBridge.exposeInMainWorld('__backendStartupFailure', backendStartupFailure ?? null);

// Backend startup state bridge: `getState` re-reads the current failure info on
// mount (resolves the "READY arrived before the renderer subscribed" race), and
// `subscribe` receives subsequent ready/exit pushes on the backend-startup-state
// channel. All communication stays behind the preload contextBridge.
contextBridge.exposeInMainWorld('__backendStartupBridge', {
  getState: () => ipcRenderer.sendSync('get-backend-startup-failure'),
  subscribe: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, value: unknown) => callback(value);
    ipcRenderer.on('backend-startup-state', handler);
    return () => {
      ipcRenderer.off('backend-startup-state', handler);
    };
  },
});

// 托盘事件监听 - 将 IPC 事件转换为 DOM 事件
// Tray event listeners - convert IPC events to DOM events
const trayEvents = [
  'tray:navigate-to-guid',
  'tray:navigate-to-conversation',
  'tray:open-about',
  'tray:pause-all-tasks',
  'tray:check-update',
];

for (const channel of trayEvents) {
  ipcRenderer.on(channel, (_event, ...args) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: args[0] }));
  });
}
