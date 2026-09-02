/**
 * In-memory session-state eviction — SP-247 (partial #145).
 *
 * Long-lived pi processes accumulate per-session routing state across several
 * in-memory maps (execution ledger, lifecycle hook flags, extension session
 * routing snapshots). `evictInMemorySessionState` drops all of it for one
 * session id in a single call so extension code (SP-248) can wire session
 * teardown without re-implementing each clear.
 */

import type { ExecutionLedger } from '../domain/delegation/execution-ledger.js';
import type { LifecycleHookState } from './middleware/pi-router-middleware.js';

export interface SessionEvictionTargets {
  /** Per-session last-executing-model ledger. */
  readonly executionLedger: ExecutionLedger;
  /** Per-session compaction / force-model lifecycle flags. */
  readonly lifecycleHookState: LifecycleHookState;
  /** Optional extension-owned routing snapshot map (cleared when provided). */
  readonly sessionRouting?: Map<string, unknown>;
}

/**
 * Delete all in-memory routing state retained for `sessionId`.
 *
 * Unknown session ids are a no-op per target. Clearing is idempotent: calling
 * eviction twice for the same session is safe.
 */
export function evictInMemorySessionState(
  sessionId: string,
  targets: SessionEvictionTargets,
): void {
  targets.executionLedger.clear(sessionId);
  targets.lifecycleHookState.evict(sessionId);
  targets.sessionRouting?.delete(sessionId);
}
