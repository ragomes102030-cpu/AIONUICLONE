// Core types for @aionui/web-host (M3 interface contract, locked for M4-M8)

/**
 * App metadata injected by host environment (Electron or Node)
 */
export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

/**
 * Backend binary resolver function injected by host environment
 */
export type BackendBinaryResolver = () => string;

/**
 * System dirs exported to the backend via AIONUI_{CACHE,WORK,LOG}_DIR env.
 * Backend surfaces these on `/api/system/info`. Omit and the backend inherits
 * process.env, which may carry stale values from the parent shell — better to
 * be explicit.
 */
export type BackendSystemDirs = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves `/api/kanban/*` on behalf of the host application.
 *
 * The Kanban does not live in aioncore: its board lives in `tasks.db`, a SQLite
 * file owned by the desktop process. So the WebUI reverse-proxies everything
 * under `/api/*` to the backend, where the Kanban route does not exist and the
 * browser gets `404 NOT_FOUND`.
 *
 * Rather than duplicating the board logic here — or porting it to Rust — the host
 * hands over a handler bound to the connection it already has open. web-host
 * stays unaware of the Kanban; it just stops forwarding these paths.
 *
 * Returning without writing a response is treated as "not mine": the request
 * falls through to the normal proxy behaviour.
 */
export type HostRouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

/**
 * Options for starting WebHost
 */
export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string;
  port?: number;
  allowRemote?: boolean;
  dataDir?: string;
  logDir?: string;
  dirs?: BackendSystemDirs;
  backend: { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver } | { kind: 'useExistingBackend'; port: number };
  /**
   * Paths the host serves itself instead of proxying to aioncore. Injected by the
   * desktop app; absent when web-host runs standalone (`bun run webui`), which
   * has no Kanban to expose.
   */
  hostRoutes?: HostRouteHandler;
};

/**
 * Handle returned by startWebHost
 */
export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};
