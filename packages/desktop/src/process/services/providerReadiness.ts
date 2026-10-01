/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';

/**
 * Why the app looks configured but produces nothing.
 *
 * AionUi is a GUI for AI agents: every assistant turn, every Kanban dispatch and
 * every planning skill ends in a model call. With no provider configured the app
 * still opens, the Kanban still accepts cards, and the dispatch still creates a
 * task — and then nothing ever answers. That failure mode is silent from the
 * outside, which is why it is checked explicitly at startup instead of being left
 * for the user to discover.
 */
export type ProviderReadiness = {
  ready: boolean;
  reason: 'ok' | 'no-providers' | 'query-failed';
  providerCount: number;
  /** Provider names, for the log line. Empty when the query failed. */
  providerNames: string[];
  /** One actionable sentence, safe to print. */
  message: string;
};

export const NO_PROVIDER_MESSAGE =
  'No AI provider is configured, so agents cannot answer. Open Settings > Model / Providers and add one (API key or a local endpoint). Everything else in the app works, but every agent turn, Kanban dispatch and planning skill ends in a model call.';

const fail = (reason: 'query-failed'): ProviderReadiness => ({
  ready: false,
  reason,
  providerCount: 0,
  providerNames: [],
  message: 'Could not read the provider list from the backend.',
});

/**
 * Report whether a provider is available.
 *
 * `fetchProviders` is injectable so this is testable without a running backend;
 * production passes the real `GET /api/providers` call.
 */
export async function checkProviderReadiness(
  fetchProviders: () => Promise<Array<{ name?: string }> | null | undefined> = async () =>
    (await httpRequest<Array<{ name?: string }>>('GET', '/api/providers')) ?? []
): Promise<ProviderReadiness> {
  let providers: Array<{ name?: string }>;
  try {
    providers = (await fetchProviders()) ?? [];
  } catch {
    // The backend may still be starting. That is not the same as "no provider",
    // and must not be reported as one.
    return fail('query-failed');
  }

  if (!Array.isArray(providers) || providers.length === 0) {
    return {
      ready: false,
      reason: 'no-providers',
      providerCount: 0,
      providerNames: [],
      message: NO_PROVIDER_MESSAGE,
    };
  }

  const providerNames = providers.map((provider) => provider?.name).filter((name): name is string => !!name);
  return {
    ready: true,
    reason: 'ok',
    providerCount: providers.length,
    providerNames,
    message: `${providers.length} provider(s) configured: ${providerNames.join(', ') || '(unnamed)'}.`,
  };
}
