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
const MS_PER_DAY = 86_400_000;
/**
 * Evaluate pricing freshness against the configured threshold.
 *
 * @param catalog       Current price catalog, or null if none loaded.
 * @param stalenessDays Operator-configured threshold (default 14).
 * @param now           Reference time for testability.
 */
export function checkStaleness(catalog, stalenessDays = 14, now = new Date()) {
    if (!catalog) {
        return {
            stale: true,
            age_days: Infinity,
            threshold_days: stalenessDays,
            warning: 'No pricing catalog loaded. Model costs will use YAML fallback values.',
        };
    }
    const lastUpdated = new Date(catalog.last_updated);
    const ageDays = (now.getTime() - lastUpdated.getTime()) / MS_PER_DAY;
    if (ageDays > stalenessDays) {
        return {
            stale: true,
            age_days: Math.round(ageDays * 10) / 10,
            threshold_days: stalenessDays,
            warning: `Pricing data is ${Math.round(ageDays)} days old (threshold: ${stalenessDays} days). ` +
                'Consider refreshing registry rates to ensure accurate cost estimation.',
        };
    }
    return {
        stale: false,
        age_days: Math.round(ageDays * 10) / 10,
        threshold_days: stalenessDays,
    };
}
//# sourceMappingURL=pricing-monitor.js.map
