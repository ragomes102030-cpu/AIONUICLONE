/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import SiderMemoryEntry from '@/renderer/components/layout/Sider/SiderMemoryEntry';

export default function MemorySettings() {
  return (
    <div className='flex flex-col h-full overflow-hidden'>
      <SiderMemoryEntry
        isMobile={false}
        collapsed={false}
        siderTooltipProps={getSiderTooltipProps(false)}
        onSessionClick={undefined}
      />
    </div>
  );
}
