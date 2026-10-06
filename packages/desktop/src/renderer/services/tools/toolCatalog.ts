/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import type {
  ToolAuthKind,
  ToolAvailability,
  ToolConnectionKind,
  ToolIntegration,
  ToolIntegrationSource,
  ToolIntegrationStatus,
} from '@/common/types/integrations/toolIntegration';
import { ToolIntegrationRegistry } from './toolIntegrationRegistry';

export type McpToolKind = 'remote-mcp' | 'local-mcp';
export type McpToolAuthMode = 'none' | 'bearer' | 'oauth';

/** A draft still uses the existing IMcpServer persistence contract. */
export type McpToolDraft = Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>;

export type RemoteMcpUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: 'empty' | 'invalid' | 'protocol' | 'credentials' | 'fragment' };

export type McpToolConnectionResult = {
  success: boolean;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema?: unknown;
    _meta?: Record<string, unknown>;
  }>;
  error?: string;
  needsAuth?: boolean;
  needs_auth?: boolean;
};

/**
 * Validate a user supplied MCP endpoint without making a request from the
 * renderer. The backend remains responsible for the actual network call and
 * SSRF policy.
 */
export function normalizeRemoteMcpUrl(value: string): RemoteMcpUrlResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'invalid' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'protocol' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'credentials' };
  }
  if (parsed.hash) {
    return { ok: false, error: 'fragment' };
  }

  return { ok: true, url: parsed.toString() };
}

export function getMcpIntegrationId(server: Pick<IMcpServer, 'id' | 'name'>): string {
  return `mcp:${server.id || server.name.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

export function getToolSelectionId(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

function getConnectionKind(server: IMcpServer): ToolConnectionKind {
  if (server.transport.type === 'stdio') return 'local-mcp';
  if (
    server.transport.type === 'http' ||
    server.transport.type === 'sse' ||
    server.transport.type === 'streamable_http'
  ) {
    return 'remote-mcp';
  }
  return 'unknown';
}

function hasBearerHeader(server: IMcpServer): boolean {
  if (server.transport.type === 'stdio') return false;
  return Object.keys(server.transport.headers ?? {}).some((key) => key.toLowerCase() === 'authorization');
}

function getAuthKind(server: IMcpServer): ToolAuthKind {
  if (server.transport.type === 'stdio') return 'none';
  if (hasBearerHeader(server)) return 'bearer';
  return 'none';
}

export function getMcpIntegrationStatus(server: IMcpServer): ToolIntegrationStatus {
  switch (server.last_test_status) {
    case 'testing':
      return 'TESTING';
    case 'connected':
      return 'CONNECTED';
    case 'disconnected':
      return 'DISCONNECTED';
    case 'error':
      return 'ERROR';
    default:
      return server.enabled ? 'CONFIGURED' : 'NOT_CONFIGURED';
  }
}

function getToolAvailability(status: ToolIntegrationStatus): ToolAvailability {
  if (status === 'CONNECTED') return 'available';
  if (status === 'DISCONNECTED' || status === 'ERROR') return 'unavailable';
  return 'unknown';
}

function normalizeTool(
  server: Pick<IMcpServer, 'id' | 'enabled'>,
  tool: IMcpTool,
  status: ToolIntegrationStatus
): ToolIntegration['tools'][number] {
  return {
    id: getToolSelectionId(server.id, tool.name),
    name: tool.name,
    description: typeof tool.description === 'string' ? tool.description : undefined,
    inputSchema: tool.input_schema,
    enabled: Boolean(server.enabled),
    availability: getToolAvailability(status),
  };
}

export function normalizeMcpToolIntegration(
  server: IMcpServer,
  source: ToolIntegrationSource = server.builtin ? 'builtin-mcp' : 'backend-mcp'
): ToolIntegration {
  const status = getMcpIntegrationStatus(server);
  const id = getMcpIntegrationId(server);
  return {
    id,
    name: server.name,
    description: server.description,
    category: source === 'extension-mcp' ? 'extension' : 'mcp',
    provider: 'native-mcp',
    source,
    status,
    connection: {
      id: server.id,
      kind: getConnectionKind(server),
      auth: getAuthKind(server),
      status,
    },
    tools: (server.tools ?? []).map((tool) => normalizeTool(server, tool, status)),
  };
}

/**
 * Build one normalized view from the existing backend, built-in and extension
 * MCP catalogs. Backend/built-in records are registered first so an extension
 * cannot silently replace the backend source of truth.
 */
export function createToolCatalog(
  backendServers: IMcpServer[],
  extensionServers: IMcpServer[] = []
): ToolIntegrationRegistry {
  const registry = new ToolIntegrationRegistry();
  registry.registerSnapshot({
    source: 'backend-mcp',
    integrations: backendServers.map((server) =>
      normalizeMcpToolIntegration(server, server.builtin ? 'builtin-mcp' : 'backend-mcp')
    ),
  });
  registry.registerSnapshot({
    source: 'extension-mcp',
    integrations: extensionServers.map((server) => normalizeMcpToolIntegration(server, 'extension-mcp')),
  });
  return registry;
}

function splitArgs(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildOriginalJson(name: string, transport: IMcpServer['transport']): string {
  const config =
    transport.type === 'stdio'
      ? { command: transport.command, args: transport.args ?? [], env: transport.env ?? {} }
      : { type: 'http', url: transport.url, ...(transport.headers ? { headers: transport.headers } : {}) };

  return JSON.stringify({ mcpServers: { [name]: config } }, null, 2);
}

/**
 * Create a real IMcpServer draft for the existing backend CRUD path.
 * Streamable HTTP is normalized to the backend's current `http` transport.
 * Bearer credentials are intentionally rejected until the backend exposes a
 * credential-reference operation; the renderer must not become a secret store.
 */
export function buildMcpToolDraft(input: {
  kind: McpToolKind;
  name: string;
  url?: string;
  command?: string;
  args?: string;
  authMode: McpToolAuthMode;
}): McpToolDraft {
  const name = input.name.trim();
  if (!name) throw new Error('Tool name is required');
  if (input.authMode === 'bearer') {
    throw new Error('Bearer credentials require a backend credential reference');
  }

  const transport: IMcpServer['transport'] =
    input.kind === 'remote-mcp'
      ? (() => {
          const result = normalizeRemoteMcpUrl(input.url ?? '');
          if (result.ok === false) throw new Error(`Invalid remote MCP URL: ${result.error}`);
          return { type: 'http', url: result.url };
        })()
      : (() => {
          const command = input.command?.trim();
          if (!command) throw new Error('Local MCP command is required');
          return { type: 'stdio', command, args: splitArgs(input.args ?? ''), env: {} };
        })();

  return {
    name,
    description: input.kind === 'remote-mcp' ? 'Remote MCP via Streamable HTTP' : 'Local MCP via stdio',
    enabled: true,
    transport,
    tools: [],
    last_test_status: 'disconnected',
    original_json: buildOriginalJson(name, transport),
  };
}
