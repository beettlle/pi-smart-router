# Task: SP-168 — Semver eval baseline JSON and regression compare

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Freeze v0.6.0 harness baseline; extend assert-release-gates with baseline regression checks; wire into release:functional-smoke.
**Score:** 4/8

## Source

- Epic: Pre-Release Functional Gates (post-v0.6.0)
- Bucket: infra

## Mission

Enable "QR didn't regress vs v0.6.0" on future releases. Add `tests/eval/baselines/v0.6.0.json` frozen `HarnessAggregateMetrics` snapshot. Add `scripts/eval/capture-baseline.ts` CLI. Extend `assert-release-gates.ts` with `--baseline` / `--baseline-version` using `computeQualityRetentionRegression` and optional deltas for capability, pin preserved, over-routing. Add `baseline_regression` section to gate config. Wire baseline compare into `release:functional-smoke`.

## Dependencies

- SP-165
- SP-166

## Context to Read First

- `scripts/eval/assert-release-gates.ts` — SP-165 CLI
- `scripts/eval/quality-retention.ts` — `computeQualityRetentionRegression`
- `scripts/eval/harness-tracks.ts` — `HarnessAggregateMetrics`
- `package.json` — `release:functional-smoke`
- `README.md` — baseline capture operator flow

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json`, `tests/eval/baselines/v0.6.0.json` |
| May change | `scripts/eval/capture-baseline.ts`, `package.json`, `tests/eval/assert-release-gates.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run release:check` |
| fileScopeMustChange | `scripts/eval/assert-release-gates.ts`, `config/release-gates.json`, `tests/eval/baselines/v0.6.0.json` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | v0.6.0 baseline JSON committed; capture-baseline CLI; baseline regression in assert-release-gates; release:functional-smoke uses baseline; release:check passes. |

## Steps

### Step 1: Baseline capture

- [ ] Add `scripts/eval/capture-baseline.ts` — `--version 0.6.0` writes `tests/eval/baselines/v0.6.0.json`
- [ ] Capture current fixture aggregate metrics from main and commit baseline file

### Step 2: Baseline regression in assert-release-gates

- [ ] Extend gate config with `baseline_regression` (`reference_version`, max drops)
- [ ] Add `--baseline` and `--baseline-version` CLI flags
- [ ] Reuse `computeQualityRetentionRegression` for QR; add optional capability/pin/over-routing deltas

### Step 3: Wire release path and verify

- [ ] Update `release:functional-smoke` to pass baseline version from config
- [ ] Document operator re-capture flow in README (post-tag v0.7.0)
- [ ] Unit test: simulated regression fails gates
- [ ] Run `npm run release:check`

## Testing

- [ ] Unit tests for baseline regression pass and fail paths
- [ ] Run `npm run release:check`

## Completion Criteria

- [ ] `tests/eval/baselines/v0.6.0.json` frozen snapshot
- [ ] `capture-baseline.ts` CLI
- [ ] Baseline regression in assert-release-gates
- [ ] `release:functional-smoke` uses baseline compare
- [ ] `npm run release:check` passes

## Git Commit Convention

- `feat(SP-168): description`

## Do NOT

- Change harness track scoring (SP-152 scope)
- Add nightly full harness workflow
- Add benchmark:encoder to release path

---
