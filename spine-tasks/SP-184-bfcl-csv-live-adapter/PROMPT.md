# Task: SP-184 — BFCL CSV Native Live Adapter

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Native adapter from Gorilla gh-pages data_overall.csv → fixture entries.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#104
- Bucket: feature
- Partial: #104

## Mission

Partial #104 — Replace the `bfcl` stub with a native CSV adapter for:

`https://raw.githubusercontent.com/ShishirPatil/gorilla/gh-pages/data_overall.csv`

Parse CSV (no heavy new dependency if stdlib/manual parse suffices). Use **Overall Acc** as `score` (strip `%`). Map `Model` column strings to catalog `model_id`s (handle `(FC)` / `(Prompt)` suffixes). Skip unmapped rows; never invent scores. Prefer Overall Acc over category sub-scores unless documented otherwise.

## Dependencies

- **Task:** SP-181

## Context to Read First

- `scripts/lib/leaderboard-adapters/` — SP-181 interface
- `tests/fixtures/benchmark-leaderboards/bfcl.json`
- `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`
- CSV header includes: `Rank,Overall Acc,Model,...`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/leaderboard-adapters/bfcl.ts` |
| May change | `tests/unit/leaderboard-adapters/bfcl.test.ts`, `scripts/lib/leaderboard-adapters/index.ts`, `tests/fixtures/benchmark-leaderboards/recorded/bfcl.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/leaderboard-adapters/bfcl.test.ts` |
| fileScopeMustChange | `scripts/lib/leaderboard-adapters/bfcl.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/livecodebench.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |
| completionCriteria | CSV → fixture entries with Overall Acc; offline sample CSV in tests; model mapping; unmapped skipped. |

## Steps

### Step 1: Parse data_overall.csv → fixture entries

- [ ] CSV parse + Overall Acc → score
- [ ] Model name → catalog `model_id` mapping
- [ ] Register live default URL for `bfcl`

### Step 2: Offline unit sample + tests

- [ ] Truncated CSV sample for CI
- [ ] Unit tests: parse, %, mapping, skip

### Step 3: Testing and verification

- [ ] Run contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Native BFCL adapter live
- [ ] Offline unit coverage
- [ ] No invented scores

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` |

## Git Commit Convention

- `feat(SP-184): description`

## Do NOT

- Add a heavy CSV library if a small parser suffices
- Touch other benchmark adapter files
- Use paid APIs
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

---

## Amendments (Added During Execution)

### 2026-07-10 — Allow SP-181 live-URL assertion updates

Registering `bfcl` `liveFetchUrl` breaks two SP-181 assertions that expect
`getDefaultLiveFetchUrls() === {}` and all adapters `liveFetchUrl === undefined`.

**File Scope May change (added):**
- `tests/unit/benchmark-leaderboard-fetch.test.ts` (live URL registry assertion only)
- `tests/unit/ingest-benchmark-profiles.test.ts` (live URL registry assertion only)
