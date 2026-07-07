# Task: SP-113 — Tier and cluster telemetry and explain endpoint

**Created:** 2026-07-07
**Size:** M

## Review Level: 1

**Assessment:** #62 — emit cluster/tier/P(success) metadata in telemetry, dataset export, explain endpoint, and routing logs.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#62
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Add observability for tier-selection decisions. Extend telemetry/dataset with `cluster_id`, `cluster_similarity`, `cluster_margin`, `low_intensity_score`, `tier_hint`, `p_success_cheap`, `local_eligible_reason`. Add reason codes (`cluster_{id}`, `low_intensity_structural`, `high_intensity_structural`, `p_success_cheap`, `p_success_uncertain`). Extend explain with cluster match table, tier feature summary, low-intensity breakdown, and local_zero skip reasons.

## Dependencies

- SP-103
- SP-106
- SP-110

## Context to Read First

- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/infrastructure/telemetry/dataset-recorder.ts`
- `src/api/explain/router-explain.ts`
- `specs/001-build-smart-router/contracts/explain-endpoint.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/api/explain/router-explain.ts` |
| May change | `src/infrastructure/telemetry/routing-telemetry.ts`, `src/infrastructure/telemetry/dataset-recorder.ts`, `tests/unit/router-explain.test.ts`, `tests/unit/routing-telemetry.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/api/explain/router-explain.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Telemetry includes cluster/tier fields; explain documents rejected tiers and local skip reasons; dataset export privacy-safe; routing log includes cluster summary; unit tests pass. |

## Steps

### Step 1: Telemetry and dataset fields

- [ ] Extend routing telemetry with cluster/tier/P(success) fields from issue spec
- [ ] Add tier-selection reason codes to decision records
- [ ] Ensure dataset export includes new privacy-safe fields

### Step 2: Explain and logging

- [ ] Extend explain serializer with cluster match table, tier features, local skip reasons
- [ ] Include cluster summary in `SMART_ROUTER_LOG_ROUTING=1` JSON log line
- [ ] Update explain contract doc if response shape changes

### Step 3: Testing and verification

- [ ] Unit tests for telemetry emitter and explain serializer
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Telemetry rows include cluster/tier fields when stages run
- [ ] Explain endpoint documents rejected tiers and local skip reasons
- [ ] Dataset export includes new fields (privacy-safe)
- [ ] `SMART_ROUTER_LOG_ROUTING=1` JSON log includes cluster summary
- [ ] Unit tests for telemetry emitter and explain serializer
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-113): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
