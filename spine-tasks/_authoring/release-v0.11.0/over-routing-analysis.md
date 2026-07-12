# TwinRouterBench CI corpus over-routing analysis (SP-202 / #112)

**Date:** 2026-07-11  
**HEAD:** `32ade07` (`task/spine-lane-1-20260712T001920`)  
**Corpus:** `tests/eval/corpus/twinrouterbench/ci-subset.json` (148 records, 68 fixtures)  
**Related:** [#112](https://github.com/beettlle/pi-smart-router/issues/112) (this analysis), soft parent [#95](https://github.com/beettlle/pi-smart-router/issues/95)

## Soft-report archive (current HEAD)

Command:

```bash
npm run routing:assert-release-gates:corpus-report
```

| Gate | Actual | Threshold | Outcome |
|------|--------|-----------|---------|
| `mean_over_routing_rate_max` | **0.868056** | 0.15 (max) | FAIL (report-only; exit 0) |
| `max_over_routing_rate_increase` (vs baseline 0.6.0) | delta **0.743056** (0.125 → 0.868056) | 0.05 | FAIL (report-only) |

Scripted breakdown (same HEAD):

```bash
npm run routing:analyze-overrouting -- --text
```

| Metric | Value |
|--------|-------|
| Harness `mean_over_routing_rate` (mean of per-fixture rates) | **0.868056** |
| Step-weighted over-routing (`100/148`) | **0.675676** |
| Absolute max (unchanged; soft-feed only) | 0.15 |

**Policy note:** This soft FAIL must **not** silently harden the corpus into `release:functional-smoke`. Absolute thresholds in `config/release-gates.json` stay fixture-backed until operators explicitly approve otherwise ([#95](https://github.com/beettlle/pi-smart-router/issues/95)).

## Breakdown (over-routed steps only)

| Axis | Top buckets |
|------|-------------|
| **stage** (`turn_type`) | `main_loop` 62 (0.62), `tool_result` 38 (0.38) |
| **reason_code** | `downgrade_first_candidate` **100 (1.00)** |
| **min_tier** | `zero-tier` **100 (1.00)** |
| **selected tier** | `economical-cloud` **100 (1.00)** |
| **min → selected** | `zero-tier->economical-cloud` **100 (1.00)** |
| **benchmark_source** | `custom` 88 (0.88), `swe-bench-verified` 12 (0.12) |

Corpus composition: `verified_target_tier` counts are `zero-tier` 100 / `economical-cloud` 15 / `frontier-cloud` 33. **Zero** records set `baseline_tier` / `baseline_model_id`.

## Root causes (evidenced)

### 1. Adapter downgrade-first default (primary — 100% of over-routes)

`scripts/eval/twinrouterbench-adapter.ts` `resolveBaselineRouting` defaults missing baselines to the cheapest **economical-cloud** catalog model with `reason_code: downgrade_first_candidate`.

Harness over-routing is `tierRank(actual) > tierRank(min_tier)`. With that default, **every** `verified_target_tier: zero-tier` record is counted as over-routed. Analyzer evidence: all 100 over-routes share `downgrade_first_candidate` and `zero-tier->economical-cloud`.

This is **not** a measurement of the live router pipeline (`src/domain/pipeline/…`). It is the static-track smoke baseline vs hindsight labels.

### 2. Soft-report metric is mean-of-fixture-rates (amplifier)

`mean_over_routing_rate` averages each fixture’s over-routing rate. Short sessions that are entirely over-routed pull the mean to **0.868** even though the step-weighted rate is **0.676**. Both exceed 0.15; the headline gap vs the absolute max is partly metric shape, not only step count.

### 3. Corpus label mix + intentional soft-feed (context)

Two-thirds of CI-subset targets are `zero-tier`. Combined with (1), structural over-routing is inevitable until baselines are grounded or the soft-feed stays advisory. Tier-map collapse (`mid_high`/`high` → `frontier-cloud` in PROVENANCE) is a separate profile-grounding topic; it does **not** drive this over-routing spike (selected tier is never frontier in the over-route set).

## Recommendation (one next action)

**Keep operator-approved soft-threshold policy for the TwinRouterBench corpus** ([#95](https://github.com/beettlle/pi-smart-router/issues/95)): continue `--report-only` soft-feed; do **not** raise absolute `mean_over_routing_rate_max`, and do **not** point `release:functional-smoke` at the corpus.

Treat the ~0.85 figure as an **adapter-default artifact**, not production over-routing evidence. Follow-ons (out of scope for SP-202):

- Measure over-routing on **live** dogfood / Track B decisions once SP-203 lands.
- Optional later PR: explicit `baseline_tier` on corpus rows or a “label-matched baseline” analysis mode — only if operators want a corpus soft-feed that is not dominated by `downgrade_first_candidate`.

**Not recommended now:** a silent “fix” that zeros soft-report over-routing by forcing baseline = verified target without documenting that the metric no longer exercises over-route detection.

## Non-goals confirmed

- [x] `config/release-gates.json` absolute thresholds untouched
- [x] Corpus not moved into hard `release:functional-smoke`
- [x] No Track B adapter (SP-203) / encoder default flips (#96 / SP-204)

## Reproduce

```bash
npm run routing:assert-release-gates:corpus-report
npm run routing:analyze-overrouting -- --text
npx vitest run tests/unit/analyze-twinrouterbench-overrouting.test.ts
```
