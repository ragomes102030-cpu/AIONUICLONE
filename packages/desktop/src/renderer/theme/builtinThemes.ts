/**
 * @license
 * Copyright 2025 Arquimedes
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { LIGHT_THEME_ID, DARK_THEME_ID } from '@/common/theme/constants';
import { defaultThemeCover } from '@renderer/pages/settings/AppearanceSettings/themeCovers';

const T0 = 0;

// Arquimedes-specific builtin themes: Light and Dark
// These replace the generic AionUi themes with themes tailored for construction/engineering workflows
export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: 'Arquimedes Light',
    appearance: 'light',
    cover: defaultThemeCover,
    builtin: true,
    created_at: T0,
    updated_at: T0,
    tokens: {
      root: {
        // Appearance-invariant tokens (same in light and dark)
        '--text-white': '#ffffff',
        '--inverse': '#ffffff',
      },
      light: {
        // Appearance-scoped tokens for light mode
        '--bg-base': '#ffffff',           /* Primary app background */
        '--bg-1': '#f8f9fa',              /* Secondary background */
        '--bg-2': '#f1f3f5',              /* Tertiary background */
        '--bg-3': '#e9ecef',              /* Border / divider background */
        '--bg-6': '#6c757d',              /* Disabled / secondary icon fill */
        '--bg-hover': '#e9ecef',          /* Hover background */
        '--bg-active': '#dee2e6',         /* Active / pressed background */
        '--text-primary': '#212529',      /* Primary text */
        '--text-secondary': '#6c757d',    /* Secondary text */
        '--text-disabled': '#ced4da',     /* Disabled text */
        '--border-base': '#dee2e6',       /* Base border */
        '--border-light': '#f1f3f5',      /* Light border */
        '--border-special': '#e9ecef',    /* Special-case border */
        '--primary': '#0d6efd',           /* Primary / accent color (blue) */
        '--success': '#198754',           /* Success color (green) */
        '--warning': '#ffc107',           /* Warning color (yellow) */
        '--danger': '#dc3545',            /* Danger / error color (red) */
        '--info': '#0dcaf0',              /* Info color (cyan) */
        '--brand': '#0d6efd',             /* Brand color */
        '--brand-light': '#f8f9fa',       /* Brand light background */
        '--brand-hover': '#0b5ed7',       /* Brand hover color */
        '--message-user-bg': '#e7f5ff',   /* User message bubble background */
        '--message-tips-bg': '#e7f5ff',   /* Tips message background */
        '--workspace-btn-bg': '#f8f9fa',  /* Workspace button background */
        '--thought-gradient': 'linear-gradient(90deg, #e7f5ff 0%, #f1f3f5 100%)', /* Thinking panel background gradient */
        '--fill': '#f8f9fa',              /* Generic fill */
        '--fill-0': '#ffffff',            /* Fill 0 (translucent in dark -> white in light) */
        '--dialog-fill-0': '#ffffff',     /* Dialog fill */
      }
    }
  },
  {
    id: DARK_THEME_ID,
    name: 'Arquimedes Dark',
    appearance: 'dark',
    builtin: true,
    created_at: T0,
    updated_at: T0,
    tokens: {
      root: {
        // Appearance-invariant tokens (same in light and dark)
        '--text-white': '#ffffff',
        '--inverse': '#ffffff',
      },
      dark: {
        // Appearance-scoped tokens for dark mode
        '--bg-base': '#000000',           /* Primary app background */
        '--bg-1': '#111111',              /* Secondary background */
        '--bg-2': '#1a1a1a',              /* Tertiary background */
        '--bg-3': '#212121',              /* Border / divider background */
        '--bg-6': '#6c757d',              /* Disabled / secondary icon fill */
        '--bg-hover': '#212121',          /* Hover background */
        '--bg-active': '#2a2a2a',         /* Active / pressed background */
        '--text-primary': '#f8f9fa',      /* Primary text */
        '--text-secondary': '#ced4da',    /* Secondary text */
        '--text-disabled': '#6c757d',     /* Disabled text */
        '--border-base': '#2a2a2a',       /* Base border */
        '--border-light': '#1a1a1a',      /* Light border */
        '--border-special': '#212121',    /* Special-case border */
        '--primary': '#0d6efd',           /* Primary / accent color (blue) */
        '--success': '#198754',           /* Success color (green) */
        '--warning': '#ffc107',           /* Warning color (yellow) */
        '--danger': '#dc3545',            /* Danger / error color (red) */
        '--info': '#0dcaf0',              /* Info color (cyan) */
        '--brand': '#0d6efd',             /* Brand color */
        '--brand-light': '#1a1a1a',       /* Brand light background */
        '--brand-hover': '#0b5ed7',       /* Brand hover color */
        '--message-user-bg': '#004080',   /* User message bubble background */
        '--message-tips-bg': '#004080',   /* Tips message background */
        '--workspace-btn-bg': '#111111',  /* Workspace button background */
        '--thought-gradient': 'linear-gradient(90deg, #004080 0%, #1a1a1a 100%)', /* Thinking panel background gradient */
        '--fill': '#111111',              /* Generic fill */
        '--fill-0': 'rgba(255, 255, 255, 0.05)', /* Fill 0 (translucent in dark) */
        '--dialog-fill-0': '#212121',     /* Dialog fill */
      }
    }
  }
];

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));
