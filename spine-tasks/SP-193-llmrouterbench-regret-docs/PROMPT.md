# Task: SP-193 — LLMRouterBench Offline Regret + Docs

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Add offline regret/cost-savings report on the pinned LLMRouterBench subset and document refresh cadence.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#103
- Bucket: feature
- Closes: #103
- Release: v0.9.3

## Mission

Closes #103 — Using the SP-192 pinned code/tool subset, ship an **offline regret / cost-savings report** script against the frozen catalog (reuse `counterfactual-replay` / `harness-tracks` patterns where practical). Document label/pool staleness and refresh cadence. Keep PR CI smoke on TwinRouterBench subset; LLMRouterBench report must stay optional/offline (no full corpus download in PR CI). Do **not** change `config/release-gates.json` absolute thresholds; do **not** implement community-bench CLI (SP-194/SP-195).

## Dependencies

- **Task:** SP-192 (subset + provenance must exist)

## Context to Read First

- `spine-tasks/SP-192-llmrouterbench-pin-subset/PROMPT.md`
- `tests/eval/corpus/llmrouterbench/PROVENANCE.md`
- `scripts/eval/counterfactual-replay.ts`
- `scripts/eval/harness-tracks.ts`
- `scripts/eval/run-harness.ts`
- `package.json` — existing `routing:eval-*` scripts
- GitHub #103 verification checklist

## Environment

- **Workspace:** `scripts/eval/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/llmrouterbench-regret-report.ts`, `tests/eval/corpus/llmrouterbench/PROVENANCE.md`, `README.md` |
| May change | `package.json`, `tests/unit/llmrouterbench-regret-report.test.ts`, `docs/routing-roadmap.md` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/llmrouterbench-regret-report.test.ts` |
| fileScopeMustChange | `scripts/eval/llmrouterbench-regret-report.ts`, `tests/unit/llmrouterbench-regret-report.test.ts`, `README.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Offline regret/CS report runs on vendored subset; staleness/refresh documented; PR CI does not download full corpus; absolute gates unchanged; #103 closable. |

## Steps

### Step 1: Offline regret / CS report

- [ ] Add `scripts/eval/llmrouterbench-regret-report.ts` (npm script e.g. `routing:llmrouterbench-regret`) that loads the SP-192 fixture/subset and prints cumulative regret + cost-savings vs frozen catalog
- [ ] Reuse existing replay/harness helpers when possible; never invent model costs missing from catalog
- [ ] Unit tests on the tiny CI fixture (deterministic summary fields)

### Step 2: Staleness docs + operator path

- [ ] Document how to regenerate subset, refresh cadence, and that PR CI stays on TwinRouterBench smoke
- [ ] Update `tests/eval/corpus/llmrouterbench/PROVENANCE.md` with report command + staleness notes
- [ ] README: short operator section for local/nightly LLMRouterBench report (optional nightly — not required in PR)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run report script on vendored fixture
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `tests/eval/corpus/llmrouterbench/PROVENANCE.md` — report command, refresh cadence *(also in File Scope)*
- `README.md` — offline LLMRouterBench regret operator path *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — §5 three-track / eval anti-pattern

## Completion Criteria

- [ ] Offline regret/CS report on pinned subset
- [ ] Staleness / refresh documented
- [ ] PR CI free of full corpus download
- [ ] Absolute gate thresholds unchanged
- [ ] `npm run verify:ci` green
- [ ] Issue #103 closable

## Git Commit Convention

- `feat(SP-193): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Implement community-bench CLI (SP-194/SP-195)
- Change `config/release-gates.json` absolute thresholds
- Require LLMRouterBench download in PR CI
- Re-open #95 / #96

## Amendments

- **2026-07-11:** Redirected Contract `fileScopeMustChange` away from `tests/eval/corpus/llmrouterbench/PROVENANCE.md` (already changed on main by SP-192) to delivery artifacts `scripts/eval/llmrouterbench-regret-report.ts` + `tests/unit/llmrouterbench-regret-report.test.ts` + `README.md`. PROVENANCE remains in File Scope Must change / Documentation Must Update.
