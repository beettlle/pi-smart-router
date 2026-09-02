# SP-251: Missing-weights reason codes (HyDRA + K4) — Status

**Current Step:** 2
**Status:** Complete
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

**Status:** ✅ Complete

- [x] Unit tests for both HyDRA and K4 missing-artifact paths
- [x] Contract `testCommand` green

## Completion Criteria

- [x] Reason codes landed; Partial #148

## Verification Evidence

- `npm run typecheck` — clean.
- `npx vitest run tests/unit/hydra-matcher.test.ts tests/unit/modernbert-heads.test.ts` — 85/85 passed (contract testCommand).
- `npm test` (full suite) — 118 files, 2104/2104 passed.
- New tests: hydra_weights_missing on missing + invalid projection artifact (fail-open placeholder still selects); none when learned weights load; k4_heads_placeholder via wrapped predictor, predictor missing/invalid artifact, and none when K=4 weights load.
- Plan reviews (RL1) requested at step checkpoints via spine_review_step — engine-owned in this session (skipped, not failed).

## Discoveries

- Placeholder fallback sites: `resolveHydraProjectionWeights` (hydra-matcher.ts) returns null on missing/invalid artifact → `projectToRequirementsPlaceholder`; `resolveModernBertK4HeadWeights` (modernbert-heads.ts) returns null → `projectClsToK4CapabilitiesPlaceholder`. Both only `console.warn` today.
- Decision metadata surface within File Scope: `MatchResult` (hydra-matcher.ts) is consumed by `router-pipeline.ts` (`currentHydraResult`) to build `RoutingDecision` + `RoutingFeatureSidecar`. Pipeline file and `specs/.../routing-decision.schema.json` (additionalProperties:false sidecar contract) are OUTSIDE File Scope → sidecar field propagation is deferred to SP-252 (sandwich integration per manifest). SP-251 surfaces codes on `MatchResult.requirement_reason_codes` + predictor/provider accessors.
- Plan: new shared constants module `src/domain/matching/missing-weights-reason-codes.ts` (`hydra_weights_missing`, `k4_heads_placeholder`); `ModernBertHeadsPredictor.missingHeadsReasonCode()`; optional `EmbeddingProvider.requirementReasonCodes?()`; HydraMatcher computes codes at init and returns them on every `MatchResult`.
