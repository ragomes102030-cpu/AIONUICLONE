/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SiderMemoryEntry from '@/renderer/components/layout/Sider/SiderMemoryEntry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({}),
}));

/**
 * Regression guard: v2.4.0 shipped this component with `<Right />` used but not
 * imported. The resulting ReferenceError escaped during the Sider render and
 * unmounted the whole React tree, leaving the app as an empty black/white
 * window. Rendering the component here fails loudly if that import ever goes
 * missing again.
 */
describe('SiderMemoryEntry', () => {
  it('renders the memory list without throwing', () => {
    render(<SiderMemoryEntry isMobile={false} collapsed={false} siderTooltipProps={{}} />);

    expect(screen.getByText('Concrete Mix Ratio C30/37')).toBeInTheDocument();
    expect(screen.getByText('Steel Beam Sizing Formula')).toBeInTheDocument();
    expect(screen.getByText('Foundation Bearing Capacity')).toBeInTheDocument();
  });

  it('filters the memories through the search field', () => {
    render(<SiderMemoryEntry isMobile={false} collapsed={false} siderTooltipProps={{}} />);

    const input = screen.getByPlaceholderText('Search memories...');
    fireEvent.change(input, { target: { value: 'steel' } });

    expect(screen.getByText('Steel Beam Sizing Formula')).toBeInTheDocument();
    expect(screen.queryByText('Concrete Mix Ratio C30/37')).not.toBeInTheDocument();
  });
});
