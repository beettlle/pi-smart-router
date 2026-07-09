# Task: SP-134 — Benchmark score ingest script

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #75 part 1 — ingest SWE-bench Verified, Terminal-Bench, LiveCodeBench, BFCL scores per model.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#75
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Create `scripts/ingest-benchmark-profiles.ts` CLI that ingests public benchmark leaderboard data (or checked-in fixture snapshots for CI) and emits normalized capability score records per model id. Include provenance metadata: source, scrape date, frozen catalog date. Output intermediate JSON consumed by SP-136 mapper integration.

## Dependencies

- SP-117 (calibration artifact patterns)

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `config/models.yaml` or `models.example.yaml`
- `scripts/train-routing-calibration.ts` (versioned artifact pattern)
- `docs/routing-roadmap.md` §2 P1

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/ingest-benchmark-profiles.ts` |
| May change | `package.json`, `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/fixtures/benchmark-leaderboards/` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/ingest-benchmark-profiles.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | CLI ingests fixture snapshots; normalized per-model scores; provenance block; npm script entry; unit tests. |

## Steps

### Step 1: Ingest CLI and schema

- [ ] Define normalized profile score record schema
- [ ] Implement ingest from fixture files (SWE-bench, Terminal-Bench, LiveCodeBench, BFCL)
- [ ] Add `npm run routing:ingest-benchmarks` script

### Step 2: Provenance and validation

- [ ] Attach source URL, scrape date, catalog freeze date
- [ ] Validate score ranges and required dimensions

### Step 3: Testing and verification

- [ ] Fixture-based unit tests
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Ingest script produces normalized benchmark records
- [ ] Provenance metadata included
- [ ] Fixture tests pass
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-134): description`

## Do NOT

- Change runtime mapper yet (SP-136)
- Add AST validation (SP-135)

---
