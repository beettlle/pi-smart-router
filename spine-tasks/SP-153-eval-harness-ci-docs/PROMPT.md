# Task: SP-153 — TwinRouterBench track, CI smoke, and local run docs

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #79 part 3 — TwinRouterBench-compatible static track, CI smoke, and operator docs.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#79
- Release: v0.5.0
- Bucket: feature

## Mission

Add TwinRouterBench static track integration or compatible fixture format adapter. Wire eval harness into CI as smoke test on fixture traces (fast, no network). Document local harness run workflow in README. Ensure published-number reproducibility via frozen catalog metadata.

## Dependencies

- SP-152

## Context to Read First

- `scripts/eval/run-harness.ts`
- `.github/workflows/` (CI pattern from calibration-verify)
- `README.md`
- TwinRouterBench reference in `docs/gemini-research.md` §9

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `scripts/eval/twinrouterbench-adapter.ts`, `.github/workflows/eval-harness-smoke.yml`, `tests/eval/twinrouterbench-adapter.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | TwinRouterBench-compatible fixtures or adapter; CI smoke workflow; README documents local run; verify:ci passes. |

## Steps

### Step 1: TwinRouterBench static track

- [ ] Adapter or fixture format compatible with TwinRouterBench static track
- [ ] Sample static-track fixtures in repo

### Step 2: CI smoke and docs

- [ ] Add CI workflow running harness on fixtures (smoke, no network)
- [ ] Document `npm run routing:eval-harness` in README

### Step 3: Testing and verification

- [ ] Adapter unit tests
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] TwinRouterBench static track integration or compatible format
- [ ] CI smoke test on fixture traces
- [ ] README documents local harness run
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-153): description`

## Do NOT

- Re-implement harness tracks (SP-152)
- Re-open or implement #1, #25, #26 (operator excluded)

---
