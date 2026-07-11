# Task: SP-201 — TwinRouterBench Weak Packs + Fit CLI

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** First-class weak packs from real CI corpus + `--include-excluded-in-fit` on calibration dry-run.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#106
- Bucket: feature
- Closes: #106
- Release: v0.10.0

## Mission

Closes #106 — Document and script generating TwinRouterBench **weak** label packs from `tests/eval/corpus/twinrouterbench/ci-subset.json` (note full-corpus input once SP-200 docs land), and expose `--include-excluded-in-fit` on `npm run routing:calibration-dry-run` wiring existing `includeExcludedInFit`. Holdout ECE must remain verifier-grade only — weak / `exclude_from_holdout_ece` rows never enter reported ECE or soft ECE pass-fail used for #96 enablement.

## Dependencies

- **Task:** SP-199 (ci-subset at 150 is the preferred weak input)
- **Task:** SP-200 (README serialization + full-corpus note)

## Context to Read First

- `scripts/ingest-twinrouterbench-weak-labels.ts`
- `scripts/verify-routing-calibration.ts` — `includeExcludedInFit`
- `tests/eval/corpus/label-packs/PROVENANCE.md`
- `tests/unit/ingest-twinrouterbench-weak-labels.test.ts`
- GitHub #106; soft #96 / #107

## Environment

- **Workspace:** `scripts/`, `tests/eval/corpus/label-packs/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/verify-routing-calibration.ts`, `tests/unit/calibration-dry-run-include-excluded.test.ts`, `tests/eval/corpus/label-packs/PROVENANCE.md` |
| May change | `scripts/ingest-twinrouterbench-weak-labels.ts`, `tests/unit/ingest-twinrouterbench-weak-labels.test.ts`, `package.json`, `README.md`, `tests/eval/corpus/label-packs/twinrouterbench-weak/**` |
| Must NOT change | `config/release-gates.json`, `src/config/defaults.ts`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/calibration-dry-run-include-excluded.test.ts tests/unit/ingest-twinrouterbench-weak-labels.test.ts` |
| fileScopeMustChange | `scripts/verify-routing-calibration.ts`, `tests/unit/calibration-dry-run-include-excluded.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/config/defaults.ts` |
| completionCriteria | Weak packs from ci-subset documented; CLI flag wires includeExcludedInFit; ECE-eligible counts unchanged when weak present; #106 closable. |

## Steps

### Step 1: Corpus → weak pack path

- [ ] Document + verify `routing:ingest-twinrouterbench-weak` from `ci-subset.json` produces schema-valid pack JSONL
- [ ] Note in PROVENANCE that full-corpus input is available after SP-200 / #107 full-track path (no require check-in)
- [ ] Keep `weak_tier_proxy` / `exclude_from_holdout_ece` enforcement

### Step 2: CLI `--include-excluded-in-fit`

- [ ] Parse flag on `routing:calibration-dry-run` → `includeExcludedInFit: true`
- [ ] Unit tests: with flag, fit sample count grows when weak rows present; holdout ECE-eligible count does **not**
- [ ] README / PROVENANCE: warm-start vs verifier-grade; #96 must use verifier holdout only

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Smoke: ingest weak from ci-subset; dry-run with and without flag
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Comment + close #106

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/label-packs/PROVENANCE.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — calibration dry-run section
- `docs/qa/shadow-dogfood-protocol.md`

## Completion Criteria

- [ ] Weak pack path from real CI subset
- [ ] `--include-excluded-in-fit` wired + tested
- [ ] Weak never in holdout ECE metrics
- [ ] #106 closable

## Git Commit Convention

- `feat(SP-201): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Count weak rows in holdout ECE / soft ECE pass-fail
- Flip `modernbert_k4` / granite defaults (#96)
- Change absolute release-gate thresholds
- Vendor full HF / TwinRouterBench dumps

## Amendments

None.
