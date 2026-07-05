/**
 * Safe cloud default — FR-022 fallback selector.
 *
 * Selects the first healthy economical-cloud model from the fleet,
 * falling back to frontier-cloud only when no economical model is available.
 * Never throws; returns undefined only when the fleet is completely empty or unhealthy.
 */
/**
 * Select a safe cloud default model from the fleet catalog.
 *
 * Priority order:
 *   1. First healthy economical-cloud model
 *   2. First healthy frontier-cloud model (fallback)
 *   3. undefined (no viable model)
 *
 * A model is considered healthy when `healthy` is true or undefined (opt-in unhealthy marking).
 */
export function safeCloudDefault(models) {
    const isHealthy = (m) => m.healthy !== false;
    const economical = models.find((m) => m.tier === 'economical-cloud' && isHealthy(m));
    if (economical)
        return economical;
    return models.find((m) => m.tier === 'frontier-cloud' && isHealthy(m));
}
//# sourceMappingURL=safe-default.js.map