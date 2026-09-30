import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_GEN_ENV_KEYS } from '@/common/config/imageGenerationMcpEnv';
import { BUILTIN_IMAGE_GEN_NAME, type IMcpServer, type IProvider } from '@/common/config/storage';
import { resolveImageGenerationMigrationConfig, runBackendMigrations } from '@/process/utils/runBackendMigrations';

const {
  batchImportServersMock,
  configFileGetMock,
  configFileSetMock,
  httpRequestMock,
  listServersMock,
  repairMcpServerTimestampsMock,
  testMcpConnectionMock,
  updateServerMock,
} = vi.hoisted(() => ({
  batchImportServersMock: vi.fn(),
  configFileGetMock: vi.fn(),
  configFileSetMock: vi.fn(),
  httpRequestMock: vi.fn(),
  listServersMock: vi.fn(),
  repairMcpServerTimestampsMock: vi.fn(),
  testMcpConnectionMock: vi.fn(),
  updateServerMock: vi.fn(),
}));

vi.mock('@/process/services/database/repairMcpServerTimestamps', () => ({
  repairMcpServerTimestamps: repairMcpServerTimestampsMock,
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    listServers: { invoke: listServersMock },
    batchImportServers: { invoke: batchImportServersMock },
    updateServer: { invoke: updateServerMock },
    testMcpConnection: { invoke: testMcpConnectionMock },
  },
}));

vi.mock('@/common/config/configMigration', () => ({
  migrateConfigStorage: vi.fn().mockResolvedValue(undefined),
  migrateLegacyMcpConfigToDb: vi.fn().mockResolvedValue(undefined),
  migrateProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/process/utils/initStorage', () => ({
  getBuiltinMcpScriptPath: (name: string) => `/mock/${name}.js`,
}));

vi.mock('@/process/utils/migrateAssistants', () => ({
  migrateAssistantsToBackend: vi.fn().mockResolvedValue(true),
}));

const provider: IProvider = {
  id: 'provider-1',
  platform: 'gemini',
  name: 'Gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'provider-key',
  models: ['gemini-image'],
  enabled: true,
};

const imageEnv = {
  [IMAGE_GEN_ENV_KEYS.providerId]: 'provider-1',
  [IMAGE_GEN_ENV_KEYS.platform]: 'gemini',
  [IMAGE_GEN_ENV_KEYS.baseUrl]: 'https://generativelanguage.googleapis.com',
  [IMAGE_GEN_ENV_KEYS.apiKey]: 'provider-key',
  [IMAGE_GEN_ENV_KEYS.model]: 'gemini-image',
};

const imageServer = (): IMcpServer => ({
  id: 'image-server-id',
  name: BUILTIN_IMAGE_GEN_NAME,
  description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
  enabled: true,
  builtin: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['/mock/builtin-mcp-image-gen.js'],
    env: imageEnv,
  },
  created_at: 1,
  updated_at: 1,
  original_json: JSON.stringify(
    {
      mcpServers: {
        [BUILTIN_IMAGE_GEN_NAME]: {
          command: 'node',
          args: ['/mock/builtin-mcp-image-gen.js'],
          env: imageEnv,
        },
      },
    },
    null,
    2
  ),
});

const configFile = {
  get: configFileGetMock,
  set: configFileSetMock,
};

beforeEach(() => {
  vi.clearAllMocks();
  configFileGetMock.mockResolvedValue(undefined);
  configFileSetMock.mockResolvedValue(undefined);
  batchImportServersMock.mockResolvedValue([]);
  repairMcpServerTimestampsMock.mockResolvedValue({
    dbPath: '/mock/aionui-backend.db',
    skipped: true,
    repairedColumns: [],
    convertedCreatedAt: 0,
    convertedUpdatedAt: 0,
    repairedUserIds: 0,
  });
  updateServerMock.mockImplementation(async ({ id, data }) => ({
    ...imageServer(),
    id,
    ...data,
  }));
  testMcpConnectionMock.mockResolvedValue({ success: false, error: 'Command not found: npx' });
  httpRequestMock.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/settings/client') {
      return {
        'tools.imageGenerationModel': {
          id: 'provider-1',
          name: 'Gemini',
          platform: 'gemini',
          use_model: 'gemini-image',
        },
      };
    }
    if (method === 'GET' && path === '/api/providers') {
      return [provider];
    }
    return undefined;
  });
});

describe('resolveImageGenerationMigrationConfig', () => {
  it('uses backend client preference when local config file no longer has the image model', () => {
    const backendConfig = {
      id: 'gemini',
      name: 'Gemini',
      platform: 'gemini',
      base_url: 'https://example.test',
      api_key: 'backend-key',
      use_model: 'gemini-image',
    };

    expect(resolveImageGenerationMigrationConfig({ 'tools.imageGenerationModel': backendConfig }, undefined)).toEqual(
      backendConfig
    );
  });
});

describe('runBackendMigrations', () => {
  it('does not write image generation business config back to local config storage', async () => {
    listServersMock.mockResolvedValue([imageServer()]);
    configFileGetMock.mockImplementation(async (key: string) => {
      if (key === 'tools.imageGenerationModel') {
        return {
          id: 'provider-1',
          name: 'Gemini',
          platform: 'gemini',
          use_model: 'gemini-image',
          switch: true,
        };
      }
      return undefined;
    });
    httpRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/settings/client') {
        return {};
      }
      if (method === 'GET' && path === '/api/providers') {
        return [provider];
      }
      return undefined;
    });

    await runBackendMigrations(configFile as never);

    expect(configFileSetMock).not.toHaveBeenCalledWith('tools.imageGenerationModel', expect.anything());
  });

  it('does not sync the built-in image MCP server when bootstrap makes no effective change', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).not.toHaveBeenCalled();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, script path changed: %s, transport changed: %s, json changed: %s, will update: %s, provider resolved: %s',
      'image-server-id',
      'no',
      'no',
      'no',
      'no',
      'yes'
    );
  });

  it('does not sync agents when only the stored image MCP JSON representation differs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([
      {
        ...imageServer(),
        original_json: '{"legacy":true}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).toHaveBeenCalledOnce();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, script path changed: %s, transport changed: %s, json changed: %s, will update: %s, provider resolved: %s',
      'image-server-id',
      'no',
      'no',
      'yes',
      'yes',
      'yes'
    );
  });

  /**
   * Regression: the stale image-MCP script path used to be gated behind
   * `imageEnvResolution.ok`. A user with no image provider configured therefore
   * kept a permanently dead absolute path — the single most silent failure in
   * this file, because it survives every restart and self-heals only by luck.
   */
  it('repairs a stale image MCP script path even when no image provider resolves', async () => {
    listServersMock.mockResolvedValue([
      {
        ...imageServer(),
        transport: {
          type: 'stdio' as const,
          command: 'node',
          // Path from a previous install location that no longer exists.
          args: ['/old/install/resources/app.asar.unpacked/out/main/builtin-mcp-image-gen.js'],
          env: { PRESERVED: 'yes' },
        },
        original_json: '{"stale":true}',
      },
    ]);
    httpRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/settings/client') return {};
      if (method === 'GET' && path === '/api/providers') return [];
      return undefined;
    });

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).toHaveBeenCalledOnce();
    const call = updateServerMock.mock.calls[0][0];
    expect(call.id).toBe('image-server-id');
    expect(call.data.transport.args).toEqual(['/mock/builtin-mcp-image-gen.js']);
    // Provider could not be resolved, so the env already on record must survive.
    expect(call.data.transport.env).toEqual({ PRESERVED: 'yes' });
  });

  it('repairs the mcp_servers catalog before the first MCP API call', async () => {
    const order: string[] = [];
    repairMcpServerTimestampsMock.mockImplementation(async () => {
      order.push('repair');
      return {
        dbPath: '/mock/aionui-backend.db',
        skipped: false,
        repairedColumns: ['created_at', 'updated_at'],
        convertedCreatedAt: 4,
        convertedUpdatedAt: 15,
        repairedUserIds: 1,
      };
    });
    listServersMock.mockImplementation(async () => {
      order.push('listServers');
      return [];
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runBackendMigrations(configFile as never);

    // The whole point: the repair must precede any /api/mcp/* traffic, because
    // that traffic is exactly what returns HTTP 500 on malformed rows.
    expect(order[0]).toBe('repair');
    expect(repairMcpServerTimestampsMock).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Migration] repaired malformed mcp_servers rows before first API call (created_at: %d, updated_at: %d, user_id: %d)',
      4,
      15,
      1
    );
  });

  it('keeps running the migration when the catalog repair fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    repairMcpServerTimestampsMock.mockRejectedValue(new Error('db locked'));
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    // A repair failure must never abort the whole migration pipeline.
    expect(listServersMock).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
