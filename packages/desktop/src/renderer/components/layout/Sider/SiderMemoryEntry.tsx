/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useState } from 'react';
import { Button, Input, InputGroup, Popover, Tooltip } from '@arco-design/web-react';
import { BookOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderMemoryEntryProps {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: ReturnType<typeof getSiderTooltipProps>;
  onSessionClick?: () => void;
}

const SiderMemoryEntry: React.FC<SiderMemoryEntryProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onSessionClick,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [memories, setMemories] = useState<Array<{ id: string; title: string; preview: string }>>([
    // Sample memories - in a real implementation, these would come from localStorage or a memory system
    { id: '1', title: 'Concrete Mix Ratio C30/37', preview: '1:1.5:3 (cement:sand:gravel) w/c=0.45' },
    { id: '2', title: 'Steel Beam Sizing Formula', preview: 'M = fy * Z; check deflection L/360' },
    { id: '3', title: 'Foundation Bearing Capacity', preview: 'q_ult = c*Nc + q*Nq + 0.5*B*Nγ*w' },
  ]);

  const filteredMemories = memories.filter(memory =>
    memory.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    memory.preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleMemoryClick = (memoryId: string) => {
    // In a real implementation, this would open the full memory
    console.log(`Opening memory ${memoryId}`);
    cleanupSiderTooltips();
    if (onSessionClick) {
      onSessionClick();
    }
  };

  return (
    <div className='min-h-full flex flex-col gap-2px'>
      {/* Memory Search Bar */}
      <InputGroup compact className='mb-4px'>
        <Input
          placeholder={t('sider.memory.search', { defaultValue: 'Search memories...' })}
          value={searchTerm}
          onChange={handleSearchChange}
          size='small'
          className='w-full'
        />
        <InputGroup.Append>
          <Button
            icon={<BookOpen theme='outline' size='16' fill='currentColor' />}
            size='small'
            onClick={handleMemoryClick.bind(null, filteredMemories[0]?.id || '')}
            disabled={!filteredMemories.length}
            tooltip={t('sider.memory.open_first', { defaultValue: 'Open first result' })}
          />
        </InputGroup.Append>
      </InputGroup>

      {/* Memories List */}
      <div className='flex-1 min-h-0 overflow-y-auto'>
        {filteredMemories.length > 0 ? (
          filteredMemories.map((memory) => (
            <Button
              key={memory.id}
              type='button'
              className={classNames(
                'w-full text-left p-3px rounded-4px border-0 bg-transparent hover:bg-[var(--color-fill-0)] flex items-center gap-3px',
                collapsed && 'collapsed-hidden'
              )}
              onClick={() => handleMemoryClick(memory.id)}
              {...siderTooltipProps}
            >
              <div className='flex-1'>
                <div className='text-12px font-medium'>{memory.title}</div>
                <div className='text-10px text-text-secondary line-clamp-2'>{memory.preview}</div>
              </div>
              <div className='text-10px text-text-secondary'>
                >
              </div>
            </Button>
          ))
        ) : (
          <div className='text-10px text-text-secondary text-center py-6px'>
            {t('sider.memory.no_results', { defaultValue: 'No memories found' })}
          </div>
        )}
      </div>

      {/* Add Memory Button */}
      <Button
        type='button'
        block
        size='small'
        className='mt-4px px-3px py-2px'
        onClick={() => {
          // In a real implementation, this would open a modal to add a new memory
          console.log('Add new memory');
          cleanupSiderTooltips();
          if (onSessionClick) {
            onSessionClick();
          }
        }}
      >
        {t('sider.memory.add_new', { defaultValue: '+ Add Memory' })}
      </Button>
    </div>
  );
};

export default SiderMemoryEntry;