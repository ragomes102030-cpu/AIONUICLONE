import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Tag, Tooltip } from '@arco-design/web-react';
import type { IMcpServer } from '@/common/config/storage';
import { getToolSelectionId } from '@/renderer/services/tools/toolCatalog';

interface McpServerToolsListProps {
  server: IMcpServer;
  /** Catalog-only selection intent; the agent still receives server-level MCP access. */
  selectedToolIds?: string[];
  onToggleTool?: (toolId: string) => void;
}

const McpServerToolsList: React.FC<McpServerToolsListProps> = ({ server, selectedToolIds, onToggleTool }) => {
  const { t } = useTranslation();

  if (!server.tools || server.tools.length === 0) {
    return null;
  }

  const selected = new Set(selectedToolIds ?? []);
  const selectedCount = server.tools.filter((tool) => selected.has(getToolSelectionId(server.id, tool.name))).length;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between text-11px text-t-tertiary'>
        <span>
          {selectedCount}/{server.tools.length} {t('settings.toolsSelected', { defaultValue: 'selected' })}
        </span>
        {server.tools.some((tool) => tool.input_schema !== undefined) && (
          <Tag size='small' color='gray'>
            {t('settings.toolsHaveSchemas', { defaultValue: 'schemas available' })}
          </Tag>
        )}
      </div>
      <div className='space-y-2'>
        {server.tools.map((tool) => {
          const toolId = getToolSelectionId(server.id, tool.name);
          return (
            <div
              key={toolId}
              className='rounded-lg border border-2 bg-bg-2 px-4 py-3'
              data-testid={`mcp-tool-${tool.name}`}
            >
              <div className='flex gap-4'>
                {onToggleTool && (
                  <Checkbox
                    checked={selected.has(toolId)}
                    onChange={() => onToggleTool(toolId)}
                    aria-label={tool.name}
                  />
                )}
                <div className='flex-shrink-0 min-w-0 w-1/3'>
                  <div className='break-words text-sm font-semibold text-t-primary'>{tool.name}</div>
                </div>
                <div className='flex-1 min-w-0'>
                  <Tooltip content={tool.description || t('settings.mcpNoDescription')}>
                    <div className='line-clamp-1 cursor-pointer text-xs leading-5 text-t-secondary'>
                      {tool.description || t('settings.mcpNoDescription')}
                    </div>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default McpServerToolsList;
