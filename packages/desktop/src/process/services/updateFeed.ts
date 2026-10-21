/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration, UpdateArtifactLayout } from './cdnGenericProvider';

/**
 * Base URL of the auto-update feed.
 *
 * Default: the "latest release assets" endpoint of the GitHub repository that
 * publishes the installers. GitHub resolves `<base>/<asset>` to the asset of the
 * release flagged as *Latest*, so the feed always points to the newest
 * published version without hosting the binaries in the repository.
 *
 * Override with `AIONUI_UPDATE_URL` to use a different host (e.g. a CDN).
 */
export const CDN_UPDATE_BASE_URL =
  process.env.AIONUI_UPDATE_URL || 'https://github.com/ragomes102030-cpu/AIONUICLONE/releases/latest/download';

/**
 * Layout of the artifacts relative to {@link CDN_UPDATE_BASE_URL}.
 *
 * - `flat` (default): `<base>/latest.yml` + `<base>/Arquimedes-<version>-win-x64.exe`
 * - `versioned`:      `<base>/latest.yml` + `<base>/<version>/<file>`
 *
 * Override with `AIONUI_UPDATE_LAYOUT=versioned` when the custom host stores
 * each release inside its own folder.
 */
export const CDN_UPDATE_LAYOUT: UpdateArtifactLayout =
  process.env.AIONUI_UPDATE_LAYOUT === 'versioned' ? 'versioned' : 'flat';

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export function buildCdnFeedOptions(): CdnFeedOptions {
  return {
    provider: 'custom',
    url: CDN_UPDATE_BASE_URL,
    layout: CDN_UPDATE_LAYOUT,
    updateProvider: CdnGenericProvider,
  };
}
