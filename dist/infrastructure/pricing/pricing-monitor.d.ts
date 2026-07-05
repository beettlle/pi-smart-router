/**
 * Pricing staleness monitor — FR-020 (T054).
 *
 * Checks whether the PriceCatalog's last_updated timestamp exceeds a
 * configurable staleness threshold (default: 14 days). When stale,
 * emits a structured warning for operator visibility.
 *
 * The monitor is stateless and side-effect-free beyond returning a
 * diagnostic result. Callers (gateway, CLI, health-check) decide how
 * to surface the warning.
 */
import type { PriceCatalog } from '../../domain/types/index.js';
export interface StalenessResult {
    readonly stale: boolean;
    readonly age_days: number;
    readonly threshold_days: number;
    readonly warning?: string;
}
/**
 * Evaluate pricing freshness against the configured threshold.
 *
 * @param catalog       Current price catalog, or null if none loaded.
 * @param stalenessDays Operator-configured threshold (default 14).
 * @param now           Reference time for testability.
 */
export declare function checkStaleness(catalog: PriceCatalog | null, stalenessDays?: number, now?: Date): StalenessResult;
//# sourceMappingURL=pricing-monitor.d.ts.map