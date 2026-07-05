/**
 * Safe cloud default — FR-022 fallback selector.
 *
 * Selects the first healthy economical-cloud model from the fleet,
 * falling back to frontier-cloud only when no economical model is available.
 * Never throws; returns undefined only when the fleet is completely empty or unhealthy.
 */
import type { ModelProfile } from '../types/index.js';
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
export declare function safeCloudDefault(models: readonly ModelProfile[]): ModelProfile | undefined;
//# sourceMappingURL=safe-default.d.ts.map
