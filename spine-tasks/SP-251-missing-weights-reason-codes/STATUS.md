# SP-251: Missing-weights reason codes (HyDRA + K4) — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Locate placeholder fallback sites + decision metadata shape

## Step 1: Reason codes in matchers

**Status:** ✅ Complete

- [x] Add shared constants for the two reason codes
- [x] Emit codes into decision/explain metadata on placeholder path
- [x] Keep stderr warn optional/additive — metadata is required

## Step 2: Testing & Verification

**Status:** 🔄 In Progress

- [ ] Unit tests for both HyDRA and K4 missing-artifact paths
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Reason codes landed; Partial #148

## Discoveries

- Placeholder fallback sites: `resolveHydraProjectionWeights` (hydra-matcher.ts) returns null on missing/invalid artifact → `projectToRequirementsPlaceholder`; `resolveModernBertK4HeadWeights` (modernbert-heads.ts) returns null → `projectClsToK4CapabilitiesPlaceholder`. Both only `console.warn` today.
- Decision metadata surface within File Scope: `MatchResult` (hydra-matcher.ts) is consumed by `router-pipeline.ts` (`currentHydraResult`) to build `RoutingDecision` + `RoutingFeatureSidecar`. Pipeline file and `specs/.../routing-decision.schema.json` (additionalProperties:false sidecar contract) are OUTSIDE File Scope → sidecar field propagation is deferred to SP-252 (sandwich integration per manifest). SP-251 surfaces codes on `MatchResult.requirement_reason_codes` + predictor/provider accessors.
- Plan: new shared constants module `src/domain/matching/missing-weights-reason-codes.ts` (`hydra_weights_missing`, `k4_heads_placeholder`); `ModernBertHeadsPredictor.missingHeadsReasonCode()`; optional `EmbeddingProvider.requirementReasonCodes?()`; HydraMatcher computes codes at init and returns them on every `MatchResult`.
