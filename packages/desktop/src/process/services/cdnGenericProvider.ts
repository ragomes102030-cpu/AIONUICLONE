/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateInfo } from 'electron-updater';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
import { resolveFiles as resolveProviderFiles } from 'electron-updater/out/providers/Provider';
import { getChannelFilename, newUrlFromBase } from 'electron-updater/out/util';
import log from 'electron-log';

type GenericProviderConfiguration = ConstructorParameters<typeof GenericProvider>[0];
type GenericProviderUpdater = ConstructorParameters<typeof GenericProvider>[1];
type GenericProviderRuntimeOptions = ConstructorParameters<typeof GenericProvider>[2];

/**
 * Where the published artifacts live relative to the feed base URL.
 *
 * - `flat`:     `<base>/latest.yml` and `<base>/Arquimedes-<version>-win-x64.exe`
 *               (layout used by GitHub Releases "latest/download" endpoint)
 * - `versioned`: `<base>/latest.yml` and `<base>/<version>/<file>`
 *               (classic CDN layout with one folder per version)
 */
export type UpdateArtifactLayout = 'flat' | 'versioned';

export type CdnGenericProviderConfiguration = Omit<GenericProviderConfiguration, 'provider'> & {
  provider: 'custom';
  updateProvider?: unknown;
  /** Defaults to `versioned` (legacy behaviour) when not informed. */
  layout?: UpdateArtifactLayout;
};

const withTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

export class CdnGenericProvider extends GenericProvider {
  private readonly _cdnBaseUrl: URL;
  // Parent stores `updater` privately; keep our own reference to rebuild the
  // channel-file URL for logging (the base `channel` getter is also private).
  private readonly _updater: GenericProviderUpdater;
  private readonly _layout: UpdateArtifactLayout;

  constructor(
    configuration: CdnGenericProviderConfiguration,
    updater: GenericProviderUpdater,
    runtimeOptions: GenericProviderRuntimeOptions
  ) {
    const genericConfiguration: GenericProviderConfiguration = {
      ...configuration,
      provider: 'generic',
    };
    super(genericConfiguration, updater, runtimeOptions);
    this._updater = updater;
    this._cdnBaseUrl = new URL(withTrailingSlash(configuration.url));
    this._layout = configuration.layout ?? 'versioned';
    log.debug('[auto-update] CDN provider initialized', {
      baseUrl: this._cdnBaseUrl.href,
      layout: this._layout,
      platform: runtimeOptions.platform,
      isUseMultipleRangeRequest: runtimeOptions.isUseMultipleRangeRequest,
    });
  }

  /**
   * Resolve the channel metadata file (e.g. `latest-mac.yml`) the updater fetches
   * to discover the newest version. Mirrors GenericProvider's private `channel`
   * getter, which is not accessible from a subclass.
   */
  private resolveLatestVersionUrl(): URL {
    const channelName = this._updater.channel ?? this.getDefaultChannelName();
    const channelFile = getChannelFilename(channelName);
    // `isAddNoCacheQuery` is a real getter on AppUpdater but absent from its public types.
    const addNoCacheQuery = Boolean((this._updater as unknown as { isAddNoCacheQuery?: boolean }).isAddNoCacheQuery);
    return newUrlFromBase(channelFile, this._cdnBaseUrl, addNoCacheQuery);
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    log.info('[auto-update] Checking latest version from URL:', this.resolveLatestVersionUrl().href);
    return super.getLatestVersion();
  }

  override resolveFiles(updateInfo: UpdateInfo): ReturnType<GenericProvider['resolveFiles']> {
    // `flat` layout: the artifact sits directly under the base URL (GitHub Releases
    // serves `<base>/<asset>` for the release flagged as "Latest").
    // `versioned` layout: the artifact sits under `<base>/<version>/`.
    const pathTransformer =
      this._layout === 'versioned' ? (filePath: string) => `${updateInfo.version}/${filePath}` : (filePath: string) => filePath;
    const resolved = resolveProviderFiles(updateInfo, this._cdnBaseUrl, pathTransformer);
    log.info('[auto-update] Update download URL(s) resolved:', {
      version: updateInfo.version,
      layout: this._layout,
      files: resolved.map((file) => file.url.href),
      packages: resolved.map((file) => file.packageInfo?.path).filter(Boolean),
    });
    return resolved;
  }
}
