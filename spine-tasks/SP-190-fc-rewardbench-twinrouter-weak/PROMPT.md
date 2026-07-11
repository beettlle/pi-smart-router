# Task: SP-190 — FC-RewardBench + TwinRouterBench Weak Labels

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Add FC-RewardBench tool-call label ingest and optional TwinRouterBench weak labels into the shared privacy-safe pack format.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#102
- Bucket: feature
- Partial: #102 (FC-RewardBench + weak labels; calibration dry-run in SP-191)
- Release: v0.9.2

## Mission

Partial #102 — Using the SP-189 label-pack schema, add an offline converter for [FC-RewardBench](https://huggingface.co/datasets/ibm-research/fc-reward-bench) tool-call correct/incorrect pairs, plus **optional** weak supervision rows derived from the landed TwinRouterBench static-track corpus (#101 / `tests/eval/corpus/twinrouterbench`). Keep artifacts privacy-safe (features + outcomes only). Ship tiny CI fixtures; do **not** vendor full upstream datasets; do **not** wire calibration dry-run/ECE (SP-191).

## Dependencies

- **Task:** SP-189 (label-pack schema + SWE-Gym path must exist)

## Context to Read First

- `Parent split: SP-189 — label-pack schema + SWE-Gym ingest`
- `scripts/lib/label-pack-schema.ts` (from SP-189)
- `scripts/ingest-swe-gym-labels.ts` — mirror CLI/fixture patterns
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- `scripts/eval/twinrouterbench-adapter.ts` + `tests/eval/corpus/twinrouterbench/` — weak-label source
- GitHub #102 (FC-RewardBench + optional TwinRouterBench weak labels)

## Environment

- **Workspace:** `scripts/`, `tests/eval/corpus/label-packs/`, `tests/unit/`
- **Services required:** None (offline CI fixtures required)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/ingest-fc-rewardbench-labels.ts`, `tests/eval/corpus/label-packs/PROVENANCE.md` |
| May change | `scripts/ingest-twinrouterbench-weak-labels.ts`, `tests/unit/ingest-fc-rewardbench-labels.test.ts`, `tests/unit/ingest-twinrouterbench-weak-labels.test.ts`, `tests/eval/corpus/label-packs/fc-rewardbench/*.jsonl`, `tests/eval/corpus/label-packs/twinrouterbench-weak/*.jsonl`, `package.json` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/label-pack-schema.ts` (API-stable unless bugfix; prefer extend via new helpers) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/ingest-fc-rewardbench-labels.test.ts tests/unit/label-pack-schema.test.ts` |
| fileScopeMustChange | `scripts/ingest-fc-rewardbench-labels.ts`, `tests/unit/ingest-fc-rewardbench-labels.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | FC-RewardBench converter emits valid pack rows; optional TwinRouterBench weak-label path documented/tested; provenance updated; no prompt leakage; no full corpus vendored. |

## Steps

### Step 1: FC-RewardBench converter + fixture

- [ ] Pin FC-RewardBench HF revision + license in `tests/eval/corpus/label-packs/PROVENANCE.md`
- [ ] Add `scripts/ingest-fc-rewardbench-labels.ts` mapping tool-call correct/incorrect → label-pack JSONL; `--limit N`; skip unmappable; never invent labels
- [ ] Tiny CI fixture under `tests/eval/corpus/label-packs/fc-rewardbench/`
- [ ] Unit tests: synthetic row → schema-valid pack; reject tainted fields if present upstream

### Step 2: Optional TwinRouterBench weak labels

- [ ] Add optional converter (script or flag) that maps TwinRouterBench static-track tier labels → weak pack rows without copying prompt/prefix text into artifacts
- [ ] Document weakness (tier proxy ≠ verifier grade) and when to exclude from holdout ECE
- [ ] Tiny fixture under `tests/eval/corpus/label-packs/twinrouterbench-weak/` **or** generate from existing corpus subset in tests without vendoring prompts
- [ ] Unit test covering weak-label path (skip with clear reason only if corpus subset missing — prefer always-on fixture)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run weak-label unit tests if separate file
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/label-packs/PROVENANCE.md` — FC-RewardBench pin + weak-label policy *(also in File Scope)*

**Check If Affected:**
- `tests/eval/corpus/twinrouterbench/PROVENANCE.md` — cross-link if helpful
- `docs/routing-roadmap.md` — advisory

## Completion Criteria

- [ ] FC-RewardBench ingest offline + tested
- [ ] TwinRouterBench weak-label path present or explicitly documented skip with fixture
- [ ] Provenance updated for both sources
- [ ] No prompt leakage in pack artifacts
- [ ] Full upstream datasets not vendored
- [ ] Contract + full suite green

## Git Commit Convention

- `feat(SP-190): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Implement calibration dry-run / ECE / OATS docs wire-up (SP-191)
- Change `config/release-gates.json` absolute thresholds
- Re-open or implement #1, #25, #26
- Vendor full HuggingFace datasets

## Amendments

- **2026-07-11:** Redirected Contract `fileScopeMustChange` away from `tests/eval/corpus/label-packs/PROVENANCE.md` (already changed on main by SP-189) to delivery artifacts `scripts/ingest-fc-rewardbench-labels.ts` + `tests/unit/ingest-fc-rewardbench-labels.test.ts`. PROVENANCE remains in File Scope Must change / Documentation Must Update.
