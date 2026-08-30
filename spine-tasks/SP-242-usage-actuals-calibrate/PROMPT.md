# Task: SP-242 — Calibrate cost estimates from rolling usage actuals

**Created:** 2026-08-30
**Size:** S

## Review Level: 1

**Assessment:** Soft-bias next-turn `estimateRoutingCost` / expected-cost using privacy-safe rolling actual/estimate ratios from SP-241 actuals; document in README.
**Score:** 3/8 — Blast radius: 2 (pricing/telemetry), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#164
- Bucket: feature
- Closes: #164
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Closes #164 — use rolling actuals from SP-241 to **calibrate** future pre-route estimates:

1. Maintain privacy-safe per-model (or per-tier) rolling **actual/estimate ratio** and/or output+cache priors.
2. Feed into next-turn `estimateRoutingCost` / expected-cost inputs; degrade to catalog estimate when cold.
3. Keep pre-route estimates for the current turn (selection cannot wait for the bill).
4. Fail open when cold / missing history.
5. README: describe how calibration soft-biases selection; note `SMART_ROUTER_LOG_ROUTING` can show ratio.
6. Do **not** replace pi footer; do **not** implement peak schedules (#165).

## Dependencies

- SP-241

## Context to Read First

- Issue #164 — calibration product rules
- SP-241 PROMPT + landed telemetry/stats changes
- `src/infrastructure/telemetry/routing-telemetry.ts` — `estimateRoutingCost`
- `src/domain/routing/expected-cost.ts`, `src/infrastructure/pricing/price-broker.ts`
- `README.md` — economics / stats sections

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/expected-cost.ts` |
| May change | `src/infrastructure/telemetry/routing-telemetry.ts`, `src/infrastructure/pricing/price-broker.ts`, `src/infrastructure/telemetry/session-stats.ts`, `README.md`, `tests/unit/**` |
| Must NOT change | `.pi/extensions/smart-router/delegation-runtime.ts` (capture already in SP-241), `src/domain/pipeline/router-pipeline.ts`, `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/routing-telemetry.test.ts tests/unit/session-stats.test.ts tests/unit/price-broker.test.ts` |
| fileScopeMustChange | `src/domain/routing/expected-cost.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Rolling actual/estimate calibration soft-biases estimates when warm; cold path uses catalog; README documents behavior; #164 closable |

## Steps

### Step 1: Rolling calibration prior

- [ ] Persist/update per-model or per-tier rolling ratio from recorded actuals vs estimates
- [ ] Apply soft bias in `estimateRoutingCost` / expected-cost path; cold → catalog
- [ ] Optional log line under `SMART_ROUTER_LOG_ROUTING` for applied ratio

### Step 2: Testing and verification

- [ ] Unit tests: warm bias changes estimate; cold unchanged; fail open
- [ ] Contract `testCommand` green
- [ ] README economics/stats section updated

## Completion Criteria

- [ ] Calibration soft-bias implemented with cold degrade
- [ ] Tests + README done
- [ ] #164 closable (with SP-241)

## Do NOT

- Encode vendor peak clocks (#165)
- Hard-ban models on cost alone
- Replace pi footer
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-242): calibrate cost estimates from usage actuals (#164)`

## Amendments

- **2026-08-30 (preflight / pre-landed file scope):** SP-241 already landed changes on `src/infrastructure/telemetry/routing-telemetry.ts`. Redirected `fileScopeMustChange` / File Scope Must change to `src/domain/routing/expected-cost.ts` (calibration soft-bias delivery artifact). `routing-telemetry.ts` remains in May change.

