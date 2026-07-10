# Task: SP-183 — LiveCodeBench Native Live Adapter

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Native adapter from LiveCodeBench performances_generation.json → fixture entries.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#104
- Bucket: feature
- Partial: #104

## Mission

Partial #104 — Replace the `livecodebench` stub with a native adapter for:

`https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_generation.json`

Aggregate per-model `pass@1` (document mean vs latest-window policy in code comments — prefer a stable, documented aggregation matching leaderboard intent). Map `model` / `model_repr` / `models[]` metadata to catalog `model_id`s. Emit fixture-shaped entries; skip unmapped models; never invent scores.

## Dependencies

- **Task:** SP-181

## Context to Read First

- `scripts/lib/leaderboard-adapters/` — SP-181 interface
- `tests/fixtures/benchmark-leaderboards/livecodebench.json`
- `spine-tasks/_authoring/live-leaderboard-adapters-20260710.md`
- Payload: `{ performances: [{ model, pass@1, ... }], models: [{ model_name, model_repr, ... }] }`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/leaderboard-adapters/livecodebench.ts` |
| May change | `tests/unit/leaderboard-adapters/livecodebench.test.ts`, `scripts/lib/leaderboard-adapters/index.ts`, `tests/fixtures/benchmark-leaderboards/recorded/livecodebench.json`, `tests/unit/ingest-benchmark-profiles.test.ts`, `tests/unit/benchmark-leaderboard-fetch.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/leaderboard-adapters/livecodebench.test.ts` |
| fileScopeMustChange | `scripts/lib/leaderboard-adapters/livecodebench.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `scripts/lib/leaderboard-adapters/swebench-verified.ts`, `scripts/lib/leaderboard-adapters/bfcl.ts`, `scripts/lib/leaderboard-adapters/terminal-bench.ts` |
| completionCriteria | Adapter aggregates LCB performances to fixture entries; offline unit sample; documented aggregation policy; unmapped skipped. |

## Steps

### Step 1: Aggregate performances → fixture entries

- [ ] Implement adapter with documented pass@1 aggregation
- [ ] Map model names → catalog `model_id`
- [ ] Register live default URL for `livecodebench`

### Step 2: Offline unit sample + tests

- [ ] Truncated performances sample for CI (no network)
- [ ] Unit tests: aggregation, mapping, skip unmapped

### Step 3: Testing and verification

- [ ] Run contract `testCommand`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Native LiveCodeBench adapter live
- [ ] Offline unit coverage
- [ ] Aggregation policy documented in code

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Check If Affected | `README.md` |

## Git Commit Convention

- `feat(SP-183): description`

## Do NOT

- Change fallback orchestration
- Touch other benchmark adapter files
- Invent scores
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`

---

## Amendments (Added During Execution)

### 2026-07-10 — SP-181 stub live-URL assertions

Registering `livecodebench.liveFetchUrl` breaks two SP-181 unit assertions that require
`getDefaultLiveFetchUrls() === {}` and all adapters `liveFetchUrl === undefined`.

**May change (added):**
- `tests/unit/ingest-benchmark-profiles.test.ts` — only the stub-registry / live-URL expectations
- `tests/unit/benchmark-leaderboard-fetch.test.ts` — only the stub-registry / live-URL expectations

Do not change orchestration behavior in those files beyond asserting LCB now exposes its default live URL.
