/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type TaskServiceHandle = {
  stop: () => void;
};

type TaskServiceStartupOptions = {
  /** Skip service creation in modes that must never dispatch persisted tasks. */
  isEnabled?: () => boolean;
  start: (backendPort: number) => Promise<TaskServiceHandle> | TaskServiceHandle;
};

export type TaskServiceStartup = {
  /** Start the service once, coalescing concurrent readiness callbacks. */
  start: (backendPort: number) => Promise<TaskServiceHandle | null>;
  /** Stop an active or still-starting service. Safe to call more than once. */
  stop: () => Promise<void>;
};

/**
 * Own the task-service lifecycle independently of how backend readiness is
 * reported. Both an immediate `running` result and a delayed `onReady` callback
 * use this path, so concurrent callbacks cannot register the IPC handlers twice.
 */
export function createTaskServiceStartup(options: TaskServiceStartupOptions): TaskServiceStartup {
  let startupPromise: Promise<TaskServiceHandle | null> | null = null;
  let service: TaskServiceHandle | null = null;
  let stopPromise: Promise<void> | null = null;

  const start = (backendPort: number): Promise<TaskServiceHandle | null> => {
    if (options.isEnabled && !options.isEnabled()) {
      return Promise.resolve(null);
    }
    if (startupPromise) return startupPromise;

    startupPromise = Promise.resolve()
      .then(() => options.start(backendPort))
      .then(
        (startedService) => {
          service = startedService;
          return startedService;
        },
        (error: unknown) => {
          // A failed import/database/runner startup must not poison later retries.
          startupPromise = null;
          throw error;
        }
      );
    return startupPromise;
  };

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;

    stopPromise = (async () => {
      let startedService = service;
      if (startupPromise) {
        try {
          startedService = await startupPromise;
        } catch {
          return;
        }
      }

      service = null;
      startupPromise = null;
      startedService?.stop();
    })().finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  };

  return { start, stop };
}
