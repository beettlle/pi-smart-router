# Task: SP-241 — Capture pi usage actuals into telemetry and stats

**Created:** 2026-08-30
**Size:** M

## Review Level: 1

**Assessment:** After delegated turns, record pi assistant `usage` (tokens + `cost.total`) into routing telemetry and surface actuals in `/smart-router stats`; fail open when usage is missing.
**Score:** 4/8 — Blast radius: 2 (extension + telemetry/stats), Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#164
- Bucket: feature
- Partial: #164 (calibration soft-bias is SP-242)
- Release: v0.20.0
- Manifest: `spine-tasks/_authoring/release-v0.20.0/manifest.md`

## Mission

Partial #164 — wire **post-turn pi usage actuals** into smart-router telemetry and stats without replacing pi’s footer UI:

1. After successful (and failed-with-usage) delegation in the pi extension, read assistant `usage`: `input`, `output`, `cacheRead`, `cacheWrite`, `cost.total`.
2. Persist alongside routing telemetry: `actual_cost_usd` and token breakdown; retain `estimated_cost_usd`.
3. Improve `/smart-router stats` (and savings math) to prefer actuals when present; label estimates clearly when actuals are missing.
4. Fail open when usage is missing (library embeds / non-pi hosts) — never fail the route.
5. Subscription models: when `cost.total` is 0 / OAuth-sub, still record token actuals; keep virtual quota scoring unchanged here.

Calibration soft-bias of `estimateRoutingCost` is **out of scope** (SP-242).

## Dependencies

- None (prior release tasks `.DONE`). SP-242 depends on this task.

## Context to Read First

- Issue #164 body — product rules, acceptance, related #118/#125/#70
- `.pi/extensions/smart-router/delegation-runtime.ts`, `route-and-delegate.ts`, `stream-delegation.ts` — where stream/turn completion is known
- `src/infrastructure/telemetry/routing-telemetry.ts` — estimate + record shape
- `src/infrastructure/telemetry/session-stats.ts` — stats / savings
- `src/infrastructure/persistence/sqlite-store.ts` — telemetry schema if persisted
- `tests/unit/session-stats.test.ts`, extension/integration tests touching stats

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/telemetry/routing-telemetry.ts` |
| May change | `.pi/extensions/smart-router/**`, `src/infrastructure/telemetry/session-stats.ts`, `src/infrastructure/persistence/sqlite-store.ts`, `src/domain/types/**`, `tests/unit/session-stats.test.ts`, `tests/integration/pi-extension.test.ts`, `tests/unit/**` (new/adjacent) |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/infrastructure/pricing/price-broker.ts`, `package.json` (version), `README.md` (docs in SP-242) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/session-stats.test.ts tests/unit/routing-telemetry.test.ts tests/integration/pi-extension.test.ts` |
| fileScopeMustChange | `src/infrastructure/telemetry/routing-telemetry.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Extension records actual usage into telemetry when pi provides it; schema includes actual cost + token breakdown with estimated fields retained; stats prefer actuals or label estimates; missing usage fails open; unit/extension tests cover the path |

## Steps

### Step 1: Capture usage at delegation completion

- [ ] Identify stream/turn completion hook in extension delegation path
- [ ] Extract pi assistant `usage` fields when present; no-op when absent
- [ ] Attach `actual_cost_usd` + token breakdown to the routing/telemetry record; keep `estimated_cost_usd`

### Step 2: Stats prefer actuals

- [ ] Update session-stats / savings math to prefer actuals when present
- [ ] Clearly label estimate-only rows when actuals missing
- [ ] Subscription `cost.total === 0`: still store token actuals; do not invent USD

### Step 3: Testing and verification

- [ ] Contract `testCommand` green (create `tests/unit/routing-telemetry.test.ts` if missing — or retarget contract to the files you add)
- [ ] Missing-usage path does not throw / fail route
- [ ] Full `npm test` once if contract suite is narrow

## Completion Criteria

- [ ] Actual usage recorded when available; estimated fields retained
- [ ] `/smart-router stats` prefers actuals or labels estimates
- [ ] Fail-open covered by tests
- [ ] Partial #164 — calibration left to SP-242

## Do NOT

- Replace or reimplement pi footer UI
- Soft-bias `estimateRoutingCost` / expected-cost selection (SP-242)
- Encode Z.ai/DeepSeek peak clocks (#165 / SP-243)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-241): capture pi usage actuals into telemetry and stats (#164)`
