/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backend (aioncore) SQLite catalog filename. Owned by the Rust backend, but
 * reachable from the main process through the same data directory it uses.
 *
 * It lives in its own module — not inside `repairMcpServerTimestamps` — because
 * both the repair and the backup need it, and tests commonly mock that module
 * wholesale. A constant buried in a mockable module turns into
 * `undefined` at import time and fails with a confusing error far away from the
 * cause.
 */
export const BACKEND_DATABASE_FILENAME = 'aionui-backend.db';
