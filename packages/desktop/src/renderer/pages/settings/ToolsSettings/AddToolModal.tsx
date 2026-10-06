import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Radio, Space } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { IMcpServer } from '@/common/config/storage';
import {
  buildMcpToolDraft,
  normalizeRemoteMcpUrl,
  type McpToolAuthMode,
  type McpToolConnectionResult,
  type McpToolKind,
} from '@/renderer/services/tools/toolCatalog';

interface AddToolModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onTestConnection: (server: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => Promise<McpToolConnectionResult>;
}

const toDiscoveredTools = (tools: McpToolConnectionResult['tools'] = []): IMcpServer['tools'] =>
  tools.map((tool) => {
    const discoveredTool: NonNullable<IMcpServer['tools']>[number] = {
      name: tool.name,
      description: tool.description,
    };
    if (tool.input_schema !== undefined) discoveredTool.input_schema = tool.input_schema;
    if (tool._meta) discoveredTool._meta = tool._meta;
    return discoveredTool;
  });

const AddToolModal: React.FC<AddToolModalProps> = ({ visible, onCancel, onSubmit, onTestConnection }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<McpToolKind>('remote-mcp');
  const [authMode, setAuthMode] = useState<McpToolAuthMode>('none');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<McpToolConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind('remote-mcp');
    setAuthMode('none');
    setName('');
    setUrl('');
    setCommand('');
    setArgs('');
    setError('');
    setTestResult(null);
    setTesting(false);
    setSubmitting(false);
  }, [visible]);

  useEffect(() => {
    setTestResult(null);
  }, [kind, authMode, name, url, command, args]);

  const buildDraft = () => buildMcpToolDraft({ kind, authMode, name, url, command, args });

  const handleTestConnection = async () => {
    if (testing) return;
    setError('');
    try {
      const draft = buildDraft();
      setTesting(true);
      const result = await onTestConnection(draft);
      setTestResult(result);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : t('settings.mcpTestConnectionFailed'));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError('');

    if (kind === 'remote-mcp') {
      const urlResult = normalizeRemoteMcpUrl(url);
      if (!urlResult.ok) {
        setError(t('settings.mcpRemoteUrlInvalid', { defaultValue: 'Enter a valid HTTP(S) MCP URL.' }));
        return;
      }
    }

    try {
      const draft = buildDraft();
      const submittedDraft = testResult?.success
        ? {
            ...draft,
            last_test_status: 'connected' as const,
            tools: toDiscoveredTools(testResult.tools),
            last_connected: Date.now(),
          }
        : draft;
      setSubmitting(true);
      const result = await onSubmit(submittedDraft);
      if (result !== false) onCancel();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('settings.mcpImportFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const testNeedsAuth = Boolean(testResult?.needsAuth || testResult?.needs_auth);
  const testMessage = testResult?.success
    ? t('settings.mcpTestConnectionSuccess')
    : testNeedsAuth
      ? t('settings.mcpAuthRequired')
      : testResult?.error || t('settings.mcpTestConnectionFailed');

  return (
    <Modal
      title={t('settings.addTool', { defaultValue: 'Add tool' })}
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={t('settings.mcpAddServer', { defaultValue: 'Add MCP server' })}
      cancelText={t('common.cancel')}
      okButtonProps={{ loading: submitting }}
      style={{ width: 620 }}
      data-testid='add-tool-modal'
    >
      <Space direction='vertical' size='medium' style={{ width: '100%' }}>
        {error && <Alert type='error' showIcon content={error} />}

        <div>
          <div className='mb-8px text-sm text-t-primary'>{t('settings.toolType', { defaultValue: 'Tool type' })}</div>
          <Radio.Group value={kind} onChange={setKind}>
            <Radio value='remote-mcp'>{t('settings.mcpRemote', { defaultValue: 'Remote MCP' })}</Radio>
            <Radio value='local-mcp'>{t('settings.mcpLocal', { defaultValue: 'Local MCP' })}</Radio>
          </Radio.Group>
        </div>

        <div>
          <div className='mb-8px text-sm text-t-primary'>{t('settings.mcpName', { defaultValue: 'Name' })}</div>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('settings.mcpNamePlaceholder', { defaultValue: 'My MCP server' })}
            data-testid='add-tool-name'
          />
        </div>

        {kind === 'remote-mcp' ? (
          <>
            <div>
              <div className='mb-8px text-sm text-t-primary'>
                {t('settings.mcpRemoteUrl', { defaultValue: 'MCP endpoint URL' })}
              </div>
              <Input value={url} onChange={setUrl} placeholder='https://example.com/mcp' data-testid='add-tool-url' />
              <div className='mt-6px text-11px text-t-tertiary'>
                {t('settings.mcpStreamableHttpHint', {
                  defaultValue: 'Uses the MCP Streamable HTTP transport through the existing backend connection.',
                })}
              </div>
            </div>
            <div>
              <div className='mb-8px text-sm text-t-primary'>
                {t('settings.mcpAuth', { defaultValue: 'Authentication' })}
              </div>
              <Radio.Group value={authMode} onChange={setAuthMode}>
                <Radio value='none'>{t('settings.mcpAuthNone', { defaultValue: 'None' })}</Radio>
                <Radio value='oauth'>{t('settings.mcpAuthOAuth', { defaultValue: 'OAuth' })}</Radio>
                <Radio value='bearer' disabled>
                  {t('settings.mcpAuthBearer', { defaultValue: 'Bearer token' })} ·{' '}
                  {t('common.comingSoon', { defaultValue: 'Coming soon' })}
                </Radio>
              </Radio.Group>
              {authMode === 'oauth' && (
                <Alert
                  className='mt-8px'
                  type='info'
                  content={t('settings.mcpOAuthAfterSave', {
                    defaultValue:
                      'After saving, the existing MCP OAuth flow will ask the backend to authenticate this URL.',
                  })}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <div className='mb-8px text-sm text-t-primary'>
                {t('settings.mcpCommand', { defaultValue: 'Command' })}
              </div>
              <Input value={command} onChange={setCommand} placeholder='npx' data-testid='add-tool-command' />
            </div>
            <div>
              <div className='mb-8px text-sm text-t-primary'>
                {t('settings.mcpArgs', { defaultValue: 'Arguments' })}
              </div>
              <Input.TextArea
                value={args}
                onChange={setArgs}
                placeholder={'-y\n@org/mcp-server'}
                autoSize={{ minRows: 3, maxRows: 6 }}
                data-testid='add-tool-args'
              />
              <div className='mt-6px text-11px text-t-tertiary'>
                {t('settings.mcpArgsHint', { defaultValue: 'One argument per line.' })}
              </div>
            </div>
          </>
        )}

        <div className='flex justify-end'>
          <Button type='secondary' loading={testing} onClick={handleTestConnection} data-testid='test-tool-connection'>
            {t('settings.mcpTestConnectionAction', { defaultValue: 'Test connection' })}
          </Button>
        </div>

        {testResult && (
          <div className='space-y-8px' data-testid='tool-connection-result'>
            <Alert
              type={testResult.success ? 'success' : testNeedsAuth ? 'warning' : 'error'}
              showIcon
              content={testMessage}
            />
            {testResult.tools && testResult.tools.length > 0 && (
              <div className='rounded-lg border border-2 border-border-2 bg-bg-2 p-8px'>
                <div className='mb-6px text-xs text-t-secondary'>
                  {testResult.tools.length} {t('settings.toolsDiscovered', { defaultValue: 'real tools discovered' })}
                </div>
                <div className='space-y-4px'>
                  {testResult.tools.map((tool) => (
                    <div key={tool.name} className='text-xs text-t-primary'>
                      <span className='font-medium'>{tool.name}</span>
                      {tool.description ? <span className='text-t-secondary'> — {tool.description}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
};

export default AddToolModal;
