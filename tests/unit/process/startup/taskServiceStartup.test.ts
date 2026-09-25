/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createTaskServiceStartup } from '@/process/startup/taskServiceStartup';

type TestTaskService = {
  stop: () => void;
};

const createHandle = (): TestTaskService => ({ stop: vi.fn() });

describe('createTaskServiceStartup', () => {
  it('starts once when a pending backend later reports ready', async () => {
    const handle = createHandle();
    let finishStartup: ((service: TestTaskService) => void) | undefined;
    const startService = vi.fn(
      () =>
        new Promise<TestTaskService>((resolve) => {
          finishStartup = resolve;
        })
    );
    const startup = createTaskServiceStartup({ start: startService });

    expect(startService).not.toHaveBeenCalled();

    const lateReady = startup.start(51317);
    const duplicateReady = startup.start(51317);
    await Promise.resolve();

    expect(startService).toHaveBeenCalledOnce();
    expect(startService).toHaveBeenCalledWith(51317);

    finishStartup?.(handle);
    await expect(lateReady).resolves.toBe(handle);
    await expect(duplicateReady).resolves.toBe(handle);
    expect(startService).toHaveBeenCalledOnce();
  });

  it('stops a retained service only once during repeated cleanup', async () => {
    const handle = createHandle();
    const startup = createTaskServiceStartup({ start: () => handle });

    await startup.start(51317);
    await Promise.all([startup.stop(), startup.stop()]);

    expect(handle.stop).toHaveBeenCalledOnce();
  });

  it('permits a clean retry after startup fails', async () => {
    const handle = createHandle();
    const failure = new Error('database unavailable');
    const startService = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(handle);
    const startup = createTaskServiceStartup({ start: startService });

    await expect(startup.start(51317)).rejects.toBe(failure);
    await expect(startup.start(51317)).resolves.toBe(handle);

    expect(startService).toHaveBeenCalledTimes(2);
  });

  it('does not start or retain a service when E2E mode disables task dispatch', async () => {
    const startService = vi.fn(() => createHandle());
    const startup = createTaskServiceStartup({
      isEnabled: () => false,
      start: startService,
    });

    await expect(startup.start(51317)).resolves.toBeNull();
    await startup.stop();

    expect(startService).not.toHaveBeenCalled();
  });
});
