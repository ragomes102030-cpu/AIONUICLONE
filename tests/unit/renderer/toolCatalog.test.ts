import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import {
  buildMcpToolDraft,
  createToolCatalog,
  getMcpIntegrationStatus,
  getToolSelectionId,
  normalizeMcpToolIntegration,
  normalizeRemoteMcpUrl,
} from '@/renderer/services/tools/toolCatalog';

const server = (overrides: Partial<IMcpServer> = {}): IMcpServer =>
  ({
    id: 'mcp-1',
    name: 'Engineering MCP',
    description: 'Engineering tools',
    enabled: true,
    transport: { type: 'http', url: 'https://example.test/mcp' },
    tools: [
      {
        name: 'read_eap',
        description: 'Read an EAP',
        input_schema: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ],
    last_test_status: 'connected',
    created_at: 1,
    updated_at: 2,
    original_json: '{}',
    ...overrides,
  }) as IMcpServer;

describe('tool catalog normalization', () => {
  it('maps MCP status to semantic catalog states', () => {
    expect(getMcpIntegrationStatus(server())).toBe('CONNECTED');
    expect(getMcpIntegrationStatus(server({ last_test_status: 'testing' }))).toBe('TESTING');
    expect(getMcpIntegrationStatus(server({ last_test_status: 'error' }))).toBe('ERROR');
    expect(getMcpIntegrationStatus(server({ last_test_status: undefined, enabled: false }))).toBe('NOT_CONFIGURED');
    expect(getMcpIntegrationStatus(server({ last_test_status: undefined, enabled: true }))).toBe('CONFIGURED');
  });

  it('preserves real MCP tool metadata and creates stable selection ids', () => {
    const integration = normalizeMcpToolIntegration(server());
    expect(integration.provider).toBe('native-mcp');
    expect(integration.connection.kind).toBe('remote-mcp');
    expect(integration.tools).toEqual([
      expect.objectContaining({
        id: getToolSelectionId('mcp-1', 'read_eap'),
        name: 'read_eap',
        description: 'Read an EAP',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        availability: 'available',
      }),
    ]);
  });

  it('normalizes backend and extension records without replacing the backend source', () => {
    const extension = server({ id: 'mcp-1', name: 'Extension duplicate', builtin: false });
    const registry = createToolCatalog([server()], [extension]);
    const integrations = registry.list();
    expect(integrations).toHaveLength(1);
    expect(integrations[0].name).toBe('Engineering MCP');
    expect(integrations[0].source).toBe('backend-mcp');
  });

  it('keeps built-in MCP records identifiable in the unified catalog', () => {
    const registry = createToolCatalog([server({ id: 'image-generation', name: 'Image Generation', builtin: true })]);
    expect(registry.list()[0].source).toBe('builtin-mcp');
  });

  it('supports register, get, list and unregister operations', () => {
    const registry = createToolCatalog([server()]);
    const id = 'mcp:mcp-1';
    expect(registry.get(id)?.name).toBe('Engineering MCP');
    expect(registry.getTools(id)).toHaveLength(1);
    expect(registry.getConnectionStatus(id)).toBe('CONNECTED');
    expect(registry.unregister(id)).toBe(true);
    expect(registry.get(id)).toBeUndefined();
  });
});

describe('remote MCP input', () => {
  it('accepts HTTP(S) endpoints and rejects unsafe URL forms', () => {
    expect(normalizeRemoteMcpUrl(' https://example.test/mcp ')).toEqual({ ok: true, url: 'https://example.test/mcp' });
    expect(normalizeRemoteMcpUrl('file:///tmp/mcp')).toEqual({ ok: false, error: 'protocol' });
    expect(normalizeRemoteMcpUrl('https://user:secret@example.test/mcp')).toEqual({
      ok: false,
      error: 'credentials',
    });
    expect(normalizeRemoteMcpUrl('https://example.test/mcp#fragment')).toEqual({ ok: false, error: 'fragment' });
  });

  it('builds a real remote draft using the existing HTTP MCP contract', () => {
    const draft = buildMcpToolDraft({
      kind: 'remote-mcp',
      name: 'Remote Engineering',
      url: 'https://example.test/mcp',
      authMode: 'none',
    });
    expect(draft.transport).toEqual({ type: 'http', url: 'https://example.test/mcp' });
    expect(draft.tools).toEqual([]);
    expect(draft.original_json).toContain('https://example.test/mcp');
  });

  it('builds a local stdio draft and rejects renderer bearer secrets', () => {
    const draft = buildMcpToolDraft({
      kind: 'local-mcp',
      name: 'Local Engineering',
      command: 'npx',
      args: '-y\n@org/engineering-mcp',
      authMode: 'none',
    });
    expect(draft.transport).toEqual({ type: 'stdio', command: 'npx', args: ['-y', '@org/engineering-mcp'], env: {} });
    expect(() =>
      buildMcpToolDraft({ kind: 'remote-mcp', name: 'Remote', url: 'https://example.test/mcp', authMode: 'bearer' })
    ).toThrow(/credential reference/i);
  });
});
