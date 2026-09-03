/**
 * Missing-weights reason codes (SP-251, #148).
 *
 * Stable reason codes emitted into routing decision metadata when HyDRA /
 * ModernBERT K=4 learned weight artifacts are missing or invalid and the
 * matchers fall back to deterministic placeholders (fail-open default).
 *
 * These codes make the degraded weight state explicit to operators instead of
 * stderr-only `console.warn`. The optional operator fail-closed config
 * (`degraded_route.fail_closed_on_missing_weights`) and degraded-sandwich
 * integration landed in SP-252; README reason-code table is SP-253.
 */

/** HyDRA learned projection weights missing/invalid → placeholder projection in use. */
export const HYDRA_WEIGHTS_MISSING_REASON_CODE = 'hydra_weights_missing';

/** ModernBERT K=4 head weights missing/invalid → placeholder heads in use. */
export const K4_HEADS_PLACEHOLDER_REASON_CODE = 'k4_heads_placeholder';

export type MissingWeightsReasonCode =
  | typeof HYDRA_WEIGHTS_MISSING_REASON_CODE
  | typeof K4_HEADS_PLACEHOLDER_REASON_CODE;
