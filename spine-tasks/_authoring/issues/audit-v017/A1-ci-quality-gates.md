## Summary

Extend CI and path-filtered workflows so routing quality gates run when `src/**` or `.pi/extensions/**` change — not only when eval scripts or calibration config change.

## Priority

P0

## Pipeline stages

`.github/workflows/ci.yml`, `eval-harness-smoke.yml`, `calibration-verify.yml`, `release.yml`

## Problem / motivation

0.17 audit (Grok/Sonnet/Gemini): PR `CI` runs build/typecheck/lint/coverage only. Eval-harness and calibration workflows are path-filtered away from pipeline and extension edits. A PR can rewrite `router-pipeline.ts` or `route-and-delegate.ts` and still go green. TwinRouterBench nightly is advisory only.

## Proposed solution

- [ ] Add `src/**` and `.pi/extensions/smart-router/**` to `eval-harness-smoke.yml` path filters (and any related eval workflows).
- [ ] Add routing-relevant `src/**` paths to `calibration-verify.yml` triggers (e.g. `p-success-classifier.ts`, `isotonic-calibrator.ts`, pipeline).
- [ ] Document optional `release:functional-smoke` subset for main-branch PRs (or required check if feasible without flake).
- [ ] Ensure `npm run verify:ci` documents the full gate set operators should run pre-release.

## Evidence

- `.github/workflows/ci.yml` — no eval/calibration/release gates
- `.github/workflows/eval-harness-smoke.yml` — triggers on `scripts/eval/**`, `tests/eval/**` only
- `.github/workflows/calibration-verify.yml` — calibration config/scripts only
- Blocks trusting #95 dogfood protocol until CI catches routing regressions

## Dependencies

| Issue | Role |
|-------|------|
| #95 | Consumer — “ready to relax frugality” requires these gates on routing code |
| #110 | Calibration verify must run when classifier code changes |

## Out of scope

- Changing absolute `config/release-gates.json` thresholds
- #96 encoder enablement
- #110 behavioral calibration content (this issue is CI wiring only)

## Verification

```bash
npm run verify:ci
# Confirm workflow YAML includes src/** and .pi/extensions/** on a test branch
gh workflow list
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Workflow YAML + branch protection alignment | Autonomous |
| Approve required-check policy on repo settings | Human operator |
