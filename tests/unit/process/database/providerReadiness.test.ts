/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The distinction these tests exist to protect: "no provider configured" (a real
 * problem the user must fix) versus "could not ask" (the backend was still
 * starting). Reporting the second as the first would send the user to Settings to
 * fix something that is already fine.
 */

import { describe, expect, it } from 'vitest';

import { NO_PROVIDER_MESSAGE, checkProviderReadiness } from '@process/services/providerReadiness';

describe('checkProviderReadiness', () => {
  it('reports a configured provider as ready and names it', async () => {
    const result = await checkProviderReadiness(async () => [{ name: 'openrouter' }, { name: 'local' }]);

    expect(result.ready).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.providerCount).toBe(2);
    expect(result.providerNames).toEqual(['openrouter', 'local']);
  });

  it('flags an empty catalog with an actionable message', async () => {
    const result = await checkProviderReadiness(async () => []);

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('no-providers');
    expect(result.providerCount).toBe(0);
    // The message has to tell the user where to go, not just that it is broken.
    expect(result.message).toBe(NO_PROVIDER_MESSAGE);
    expect(result.message).toMatch(/Settings/);
  });

  it('treats a null payload the same as an empty catalog', async () => {
    const result = await checkProviderReadiness(async () => null);

    expect(result.reason).toBe('no-providers');
    expect(result.ready).toBe(false);
  });

  it('does not claim "no provider" when the backend could not be asked', async () => {
    const result = await checkProviderReadiness(async () => {
      throw new Error('backend still starting');
    });

    // The whole point: a startup race must not masquerade as missing config.
    expect(result.reason).toBe('query-failed');
    expect(result.ready).toBe(false);
    expect(result.message).not.toBe(NO_PROVIDER_MESSAGE);
  });

  it('survives providers with no name field', async () => {
    const result = await checkProviderReadiness(async () => [{}, { name: '' }]);

    expect(result.ready).toBe(true);
    expect(result.providerCount).toBe(2);
    expect(result.providerNames).toEqual([]);
    expect(result.message).toContain('(unnamed)');
  });
});
