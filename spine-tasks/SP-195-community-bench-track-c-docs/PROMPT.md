# Task: SP-195 — Community Bench Track B/C + Docs

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Wire optional Track B skip (#95) and Track C LLMRouterBench into community-bench; document contribute flow; close #105.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#105
- Bucket: feature
- Closes: #105
- Release: v0.9.3

## Mission

Closes #105 — Extend SP-194 community-bench CLI with (1) **Track B (optional):** `--dogfood-export PATH` once #95 defines export → harness path; if adapter incomplete, **skip with explicit reason** (never invent labels), (2) **Track C (optional):** `--llmrouterbench` / `--full` offline regret/CS on the SP-192/SP-193 pinned code/tool subset — keep PR CI free of full corpus download, (3) README **“Contribute a community bench report”** (email `.txt` and/or GitHub issue); maintainer contact constant must match README. Do **not** change `config/release-gates.json` absolute thresholds; do **not** auto-send email.

## Dependencies

- **Task:** SP-194 (Track A CLI must exist)
- **Task:** SP-193 (LLMRouterBench regret path for Track C)

## Context to Read First

- `spine-tasks/SP-194-community-bench-cli-track-a/PROMPT.md`
- `spine-tasks/SP-193-llmrouterbench-regret-docs/PROMPT.md`
- `scripts/eval/community-bench.ts` (from SP-194)
- `scripts/eval/llmrouterbench-regret-report.ts` (from SP-193)
- `tests/eval/corpus/llmrouterbench/PROVENANCE.md`
- `README.md` — existing eval / dogfood sections
- GitHub #105 verification; soft: #95 still open

## Environment

- **Workspace:** `scripts/eval/`, `README.md`, `package.json`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/community-bench.ts`, `README.md`, `tests/unit/community-bench-track-bc.test.ts` |
| May change | `package.json`, `tests/unit/community-bench.test.ts`, `scripts/eval/llmrouterbench-regret-report.ts`, `docs/routing-roadmap.md` |
| Must NOT change | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/community-bench.test.ts tests/unit/community-bench-track-bc.test.ts` |
| fileScopeMustChange | `tests/unit/community-bench-track-bc.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Track B skips with reason when #95 adapter missing; Track C optional offline on vendored LLMRouterBench subset; README contribute section + matching maintainer contact; PR CI does not download full corpora; #105 closable. |

## Steps

### Step 1: Track B skip + Track C flags

- [ ] `--dogfood-export PATH`: if #95 adapter incomplete, skip Track B with reason string in report (never invent labels)
- [ ] `--llmrouterbench` / `--full`: run SP-193 regret path on vendored subset; omit network downloads
- [ ] Unit tests in **new** `tests/unit/community-bench-track-bc.test.ts`: Track B skip reason; Track C runs offline on fixture when flagged

### Step 2: README contribute + contact parity

- [ ] README section “Contribute a community bench report” covering email `.txt` and GitHub issue paths
- [ ] Maintainer contact constant in CLI footer **must match** README
- [ ] Cross-link TwinRouterBench corpus + LLMRouterBench optional Track C

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run routing:community-bench` (Track A) and with `--llmrouterbench` offline
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Documentation Requirements

**Must Update:**
- `README.md` — Contribute a community bench report *(also in File Scope)*

**Check If Affected:**
- `docs/routing-roadmap.md` — community / dogfood wording
- `tests/eval/corpus/llmrouterbench/PROVENANCE.md` — Track C cross-link

## Completion Criteria

- [ ] Track B skip-with-reason when #95 incomplete
- [ ] Track C optional offline
- [ ] README contribute section + contact parity
- [ ] PR CI free of full corpus download
- [ ] Absolute gate thresholds unchanged
- [ ] `npm run verify:ci` green
- [ ] Issue #105 closable

## Git Commit Convention

- `feat(SP-195): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Invent dogfood labels when #95 adapter missing
- Change `config/release-gates.json` absolute thresholds
- Auto-send email or upload reports
- Implement full #95 dogfood protocol (separate issue)
- Enable modernbert_k4 (#96)

## Amendments

- **2026-07-11:** Redirected Contract `fileScopeMustChange` away from `scripts/eval/community-bench.ts` (already changed on main by SP-194) to delivery artifact `README.md`. `community-bench.ts` remains in File Scope Must change for Track B/C wiring; unit tests may also change.
- **2026-07-11 (post SP-193):** `README.md` also changed on main by SP-193. Redirected `fileScopeMustChange` to new delivery artifact `tests/unit/community-bench-track-bc.test.ts`. README remains in File Scope Must change / Documentation Must Update; `community-bench.ts` still Must change for Track B/C flags.
