# Task: SP-202 — TwinRouterBench Over-Routing Analysis

**Created:** 2026-07-11
**Size:** M

## Review Level: 1

**Assessment:** Scripted corpus over-routing breakdown + authoring report; no gate threshold edits.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#112
- Bucket: feature
- Closes: #112
- Soft parent: #95
- Release: v0.11.0

## Mission

Closes #112 — Reproduce TwinRouterBench CI corpus soft-report over-routing (~0.85 vs absolute max 0.15), break down by stage / reason_code / min_tier / selected tier with a scripted analyzer, identify top 2–3 root causes with evidence, and recommend fix vs profile grounding vs operator-approved soft-threshold policy. Write a short report under `spine-tasks/_authoring/release-v0.11.0/`. Do **not** edit `config/release-gates.json` absolute thresholds or move corpus into hard `release:functional-smoke`.

## Dependencies

- **None**

## Context to Read First

- `scripts/eval/assert-release-gates.ts` — `--report-only` soft-feed
- `scripts/eval/harness-tracks.ts`
- `tests/eval/corpus/twinrouterbench/`
- `docs/qa/shadow-dogfood-protocol.md`
- GitHub #112; soft #95

## Environment

- **Workspace:** `scripts/eval/`, `tests/unit/`, `spine-tasks/_authoring/release-v0.11.0/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/analyze-twinrouterbench-overrouting.ts`, `tests/unit/analyze-twinrouterbench-overrouting.test.ts`, `spine-tasks/_authoring/release-v0.11.0/over-routing-analysis.md` |
| May change | `package.json`, `README.md` (one-line link to analyzer / report only) |
| Must NOT change | `config/release-gates.json`, `src/config/defaults.ts`, `src/domain/pipeline/router-pipeline.ts`, `scripts/eval/community-bench.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/analyze-twinrouterbench-overrouting.test.ts` |
| fileScopeMustChange | `scripts/eval/analyze-twinrouterbench-overrouting.ts`, `tests/unit/analyze-twinrouterbench-overrouting.test.ts`, `spine-tasks/_authoring/release-v0.11.0/over-routing-analysis.md` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/config/defaults.ts` |
| completionCriteria | Soft-report reproduced; breakdown script + unit tests; report with ≥2 evidenced root causes + recommendation; absolute gates untouched; #112 closable. |

## Steps

### Step 1: Reproduce soft-report + analyzer

- [ ] Archive current `npm run routing:assert-release-gates:corpus-report` numbers (or equivalent) for HEAD
- [ ] Add `scripts/eval/analyze-twinrouterbench-overrouting.ts` that breaks down over-routing by stage / reason_code / min_tier / selected tier
- [ ] Wire `package.json` script (e.g. `routing:analyze-overrouting`) if helpful
- [ ] Unit tests on fixture/corpus-derived aggregates (deterministic)

### Step 2: Authoring report + recommendation

- [ ] Write `spine-tasks/_authoring/release-v0.11.0/over-routing-analysis.md` with archived numbers, top 2–3 causes with evidence, and one recommended next action (fix PR / profile grounding / soft-threshold policy)
- [ ] Explicit: analysis must not silently harden corpus into `release:functional-smoke`
- [ ] Link report from #112 and mention #95

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Smoke: analyzer on TwinRouterBench CI corpus exits 0 and prints breakdown
- [ ] Run `npm run verify:ci`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] Comment + close #112

## Documentation Requirements

**Must Update:**
- `spine-tasks/_authoring/release-v0.11.0/over-routing-analysis.md` *(also in File Scope)*

**Check If Affected:**
- `README.md` — TwinRouterBench / #95 soft-feed section
- `docs/qa/shadow-dogfood-protocol.md`

## Completion Criteria

- [ ] Soft-report numbers archived for current HEAD
- [ ] Scripted over-routing breakdown with tests
- [ ] Report with evidenced causes + recommendation
- [ ] Absolute gates / functional-smoke corpus path untouched
- [ ] #112 closable

## Git Commit Convention

- `feat(SP-202): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Edit `config/release-gates.json` absolute thresholds
- Move TwinRouterBench corpus into hard `release:functional-smoke`
- Implement Track B adapter (SP-203) or flip encoder defaults (#96 / SP-204)
- Invent labels or fabricate metrics

## Amendments

None.
